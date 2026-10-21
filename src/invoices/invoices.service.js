import {
  Injectable, Dependencies, BadRequestException, ConflictException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { APP_CONFIG } from '../common/tokens';
import { unwrap, paginate, ilikeTerm } from '../common/utils/db';
import { billingPeriod, daysBetween } from '../common/utils/dates';
import { calculatePay, PayCalculationError } from './pay-calculator';
import { renderInvoicePdf } from './invoice-pdf';

const MAX_PERIOD_DAYS = 62;
const LIST_COLUMNS =
  'id, invoice_number, employee_id, project_id, period_start, period_end, working_days, payable_days, ' +
  'gross_amount, net_amount, currency, status, generated_by, created_at, ' +
  'employee:employees(employee_code, full_name), project:projects(name)';

@Injectable()
@Dependencies(SupabaseService, APP_CONFIG)
export class InvoicesService {
  logger = new Logger(InvoicesService.name);

  constructor(supabase, config) {
    this.db = supabase.admin;
    this.storage = supabase.admin.storage;
    this.config = config;
  }

  /** Runs the pay calculation without saving anything. */
  async preview(dto) {
    const { calc, employee, project } = await this.calculate(dto);
    return { employee, project, ...calc };
  }

  async create(dto, actor) {
    const { calc, employee, project } = await this.calculate(dto);
    const { bucket } = this.config.invoices;

    const paid = unwrap(
      await this.db
        .from('invoices')
        .select('invoice_number, status')
        .eq('employee_id', employee.id)
        .eq('project_id', project.id)
        .eq('period_start', calc.periodStart)
        .eq('period_end', calc.periodEnd)
        .neq('status', 'void'),
    ).find((i) => i.status === 'paid');
    if (paid) throw new ConflictException(`${paid.invoice_number} for this period is already paid. Mark it as unpaid first to replace it.`);

    const invoiceNumber = unwrap(await this.db.rpc('next_invoice_number', { p_period_end: calc.periodEnd }));
    const issuedAt = new Date().toISOString();
    const generatedBy = actor.fullName ? `${actor.fullName} <${actor.email}>` : actor.email;

    const pdf = await renderInvoicePdf({
      invoiceNumber, issuedAt, status: 'issued', generatedBy, calc, employee, project, company: this.config.company,
    });
    const pdfPath = `${employee.id}/${invoiceNumber}.pdf`;
    const upload = await this.storage.from(bucket).upload(pdfPath, pdf, { contentType: 'application/pdf' });
    if (upload.error) throw upload.error;

    // Frozen snapshot of everything the invoice was built from.
    const breakdown = {
      ...calc,
      employee: {
        id: employee.id, employee_code: employee.employee_code, full_name: employee.full_name,
        designation: employee.designation, department: employee.department,
      },
      project: {
        id: project.id, name: project.name, client_name: project.client_name,
        billing_cycle_start_day: project.billing_cycle_start_day,
      },
      company: this.config.company,
      generated_by: generatedBy,
      issued_at: issuedAt,
    };

    const { data: invoice, error } = await this.db.rpc('issue_invoice', {
      p: {
        invoice_number: invoiceNumber,
        employee_id: employee.id,
        project_id: project.id,
        period_start: calc.periodStart,
        period_end: calc.periodEnd,
        working_days: calc.workingDays,
        payable_days: calc.payableDays,
        gross_amount: calc.grossAmount,
        adjustments: calc.adjustments,
        net_amount: calc.netAmount,
        currency: calc.currency,
        breakdown,
        pdf_path: pdfPath,
        generated_by: actor.id,
      },
    });
    if (error) {
      await this.storage.from(bucket).remove([pdfPath]).catch(() => {});
      unwrap({ data: null, error });
    }

    return { invoice, pdfUrl: await this.signedUrl(pdfPath), warnings: calc.warnings };
  }

  async list({ page, limit, employeeId, projectId, status, from, to, search }) {
    const range = paginate(page, limit);
    let query = this.db
      .from('invoices')
      .select(LIST_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(range.from, range.to);
    if (employeeId) query = query.eq('employee_id', employeeId);
    if (projectId) query = query.eq('project_id', projectId);
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('period_end', from);
    if (to) query = query.lte('period_start', to);
    if (search?.trim()) query = query.ilike('invoice_number', ilikeTerm(search));
    const { data, count, error } = await query;
    unwrap({ data, error });
    return { data, page, limit, total: count };
  }

  async findOne(id) {
    return unwrap(await this.db.from('invoices').select('*').eq('id', id).maybeSingle(), 'Invoice not found');
  }

  async pdfUrl(id, { download = false } = {}) {
    const invoice = await this.findOne(id);
    if (!invoice.pdf_path) throw new UnprocessableEntityException('This invoice has no PDF');
    const fileName = `${invoice.invoice_number}.pdf`;
    return { invoiceNumber: invoice.invoice_number, fileName, pdfUrl: await this.signedUrl(invoice.pdf_path, download ? fileName : null) };
  }

  /** Permanently deletes the invoice and its PDF from storage. */
  async remove(id) {
    const invoice = await this.findOne(id);
    if (invoice.pdf_path) {
      const { error } = await this.storage.from(this.config.invoices.bucket).remove([invoice.pdf_path]);
      if (error) throw error;
    }
    unwrap(await this.db.from('invoices').delete().eq('id', id).select('id').maybeSingle(), 'Invoice not found');
    return { deleted: true, invoiceNumber: invoice.invoice_number, pdfRemoved: Boolean(invoice.pdf_path) };
  }

  /** Records that the payment was received. */
  async markPaid(id, { paidOn, reference, note }, actor) {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'issued') throw new ConflictException(`Only issued invoices can be marked as paid (this one is ${invoice.status})`);
    return unwrap(
      await this.db
        .from('invoices')
        .update({ status: 'paid', paid_at: paidOn, paid_by: actor.id, payment_reference: reference?.trim() || null, payment_note: note?.trim() || null })
        .eq('id', id)
        .eq('status', 'issued')
        .select()
        .maybeSingle(),
      'Invoice not found',
    );
  }

  /** Undo "paid" (e.g. marked by mistake or the payment bounced). */
  async markUnpaid(id) {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'paid') throw new ConflictException('This invoice is not marked as paid');
    return unwrap(
      await this.db
        .from('invoices')
        .update({ status: 'issued', paid_at: null, paid_by: null, payment_reference: null, payment_note: null })
        .eq('id', id)
        .select()
        .maybeSingle(),
      'Invoice not found',
    );
  }

  async void(id, actor) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'void') throw new ConflictException('Invoice is already void');
    if (invoice.status === 'paid') throw new ConflictException('This invoice is paid. Mark it as unpaid before voiding it.');
    return unwrap(
      await this.db
        .from('invoices')
        .update({ status: 'void', voided_by: actor.id, voided_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'issued')
        .select()
        .maybeSingle(),
      'Invoice not found',
    );
  }

  async signedUrl(path, downloadName = null) {
    const { bucket, signedUrlTtl } = this.config.invoices;
    const options = downloadName ? { download: downloadName } : undefined;
    const { data, error } = await this.storage.from(bucket).createSignedUrl(path, signedUrlTtl, options);
    if (error) throw error;
    return { url: data.signedUrl, expiresIn: signedUrlTtl };
  }

  // ---------------------------------------------------------------------------

  async calculate(dto) {
    const [employee, project] = await Promise.all([
      unwrap(await this.db.from('employees').select('*').eq('id', dto.employeeId).maybeSingle(), 'Employee not found'),
      unwrap(await this.db.from('projects').select('*').eq('id', dto.projectId).maybeSingle(), 'Project not found'),
    ]);

    const period = dto.month
      ? billingPeriod(dto.month, project.billing_cycle_start_day)
      : { start: dto.periodStart, end: dto.periodEnd };
    if (period.end < period.start) throw new BadRequestException('periodEnd must be on or after periodStart');
    if (daysBetween(period.start, period.end) > MAX_PERIOD_DAYS) {
      throw new BadRequestException(`A billing period cannot exceed ${MAX_PERIOD_DAYS} days`);
    }

    const [holidays, assignments, attendance, salaries] = await Promise.all([
      this.db
        .from('holidays')
        .select('date, name')
        .gte('date', period.start)
        .lte('date', period.end)
        .or(`project_id.is.null,project_id.eq.${project.id}`),
      this.db
        .from('project_assignments')
        .select('start_date, end_date')
        .eq('employee_id', employee.id)
        .eq('project_id', project.id)
        .lte('start_date', period.end)
        .or(`end_date.is.null,end_date.gte.${period.start}`),
      this.db
        .from('attendance')
        .select('date, status')
        .eq('employee_id', employee.id)
        .gte('date', period.start)
        .lte('date', period.end),
      this.db
        .from('salaries')
        .select('effective_month, monthly_amount, currency')
        .eq('employee_id', employee.id)
        .lte('effective_month', period.end)
        .order('effective_month'),
    ]).then((results) => results.map((r) => unwrap(r)));

    let calc;
    try {
      calc = calculatePay({
        periodStart: period.start,
        periodEnd: period.end,
        weekendDays: project.weekend_days,
        holidays,
        assignments,
        employment: { dateOfJoining: employee.date_of_joining, offRoleDate: employee.off_role_date },
        attendance,
        salaries,
        adjustments: dto.adjustments || [],
      });
    } catch (err) {
      if (err instanceof PayCalculationError) {
        throw new UnprocessableEntityException({ statusCode: 422, error: err.code, message: err.message });
      }
      throw err;
    }

    if (calc.currency && project.currency && calc.currency !== project.currency.trim()) {
      calc.warnings.push({
        code: 'CURRENCY_MISMATCH',
        message: `Salary currency ${calc.currency} differs from project currency ${project.currency}; invoice uses ${calc.currency}`,
      });
    }
    return { calc, employee, project };
  }
}
