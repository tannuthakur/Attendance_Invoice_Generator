import { Injectable, Dependencies, BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { APP_CONFIG } from '../common/tokens';
import { unwrap, paginate, fetchAll, ilikeTerm } from '../common/utils/db';
import { billingPeriod, daysBetween, formatDate, daysInMonth } from '../common/utils/dates';
import { calculateProjectInvoice, ProjectInvoiceError } from './project-invoice-calculator';
import { renderProjectInvoicePdf } from './project-invoice-pdf';

const MAX_PERIOD_DAYS = 62;
const LIST_COLUMNS =
  'id, invoice_number, project_id, period_start, period_end, issue_date, due_date, currency, total_amount, status, created_at, ' +
  'project:projects(name, client_name)';

@Injectable()
@Dependencies(SupabaseService, APP_CONFIG)
export class ProjectInvoicesService {
  constructor(supabase, config) {
    this.db = supabase.admin;
    this.storage = supabase.admin.storage;
    this.config = config;
  }

  async preview(dto) {
    const { calc, project, issueDate, dueDate } = await this.calculate(dto);
    return {
      project: { id: project.id, name: project.name, clientName: project.client_name, clientContact: project.client_contact },
      invoiceNumber: dto.invoiceNumber?.trim() || (await this.nextInvoiceNumber()),
      issueDate,
      dueDate,
      currency: project.currency.trim(),
      ...calc,
    };
  }

  async create(dto, actor) {
    const { calc, project, issueDate, dueDate } = await this.calculate(dto);
    const currency = project.currency.trim();
    if (!calc.lines.length && !calc.extraLines.length) {
      const reasons = calc.skipped.map((s) => `${s.fullName}: ${s.reason}`).join('; ');
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'NO_LINES',
        message: `Nothing to bill. ${reasons}`,
      });
    }

    const paid = unwrap(
      await this.db
        .from('project_invoices')
        .select('invoice_number, status')
        .eq('project_id', project.id)
        .eq('period_start', calc.periodStart)
        .eq('period_end', calc.periodEnd)
        .neq('status', 'void'),
    ).find((i) => i.status === 'paid');
    if (paid) throw new ConflictException(`${paid.invoice_number} for this period is already paid. Mark it as unpaid first to replace it.`);

    const invoiceNumber = await this.resolveInvoiceNumber(dto.invoiceNumber);

    const pdf = await renderProjectInvoicePdf({
      invoiceNumber, issueDate, dueDate, currency, project, calc, company: this.config.company, bank: this.config.bank,
    });
    const pdfPath = `projects/${project.id}/${invoiceNumber.replace(/\//g, '-')}.pdf`;
    const upload = await this.storage
      .from(this.config.invoices.bucket)
      .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
    if (upload.error) throw upload.error;

    const lines = [...calc.lines, ...calc.extraLines.map((x) => ({ ...x, extra: true }))];
    const { data: invoice, error } = await this.db.rpc('issue_project_invoice', {
      p: {
        invoice_number: invoiceNumber,
        project_id: project.id,
        period_start: calc.periodStart,
        period_end: calc.periodEnd,
        issue_date: issueDate,
        due_date: dueDate,
        currency,
        lines,
        total_amount: calc.totalAmount,
        breakdown: {
          ...calc,
          project: {
            id: project.id, name: project.name, client_name: project.client_name,
            client_contact: project.client_contact, invoice_title: project.invoice_title,
          },
          company: this.config.company,
          bank: this.config.bank,
          generated_by: actor.fullName ? `${actor.fullName} <${actor.email}>` : actor.email,
        },
        pdf_path: pdfPath,
        generated_by: actor.id,
      },
    });
    if (error) {
      await this.storage.from(this.config.invoices.bucket).remove([pdfPath]).catch(() => {});
      unwrap({ data: null, error });
    }

    return { invoice, pdfUrl: await this.signedUrl(pdfPath), warnings: calc.warnings, skipped: calc.skipped };
  }

  async list({ page, limit, projectId, status, from, to, search }) {
    const range = paginate(page, limit);
    let query = this.db
      .from('project_invoices')
      .select(LIST_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(range.from, range.to);
    if (projectId) query = query.eq('project_id', projectId);
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('period_end', from);
    if (to) query = query.lte('period_start', to);
    if (search?.trim()) query = query.ilike('invoice_number', ilikeTerm(search));
    const { data, count, error } = await query;
    unwrap({ data, error });
    return { data, page, limit, total: count };
  }

  /** Highest S-number used so far + 1 (never below PROJECT_INVOICE_START_NUMBER). */
  async nextInvoiceNumber() {
    const rows = await fetchAll(() => this.db.from('project_invoices').select('invoice_number').ilike('invoice_number', 'S%').order('id'));
    const used = rows.map((r) => /^S(\d+)$/i.exec(r.invoice_number)?.[1]).filter(Boolean).map(Number);
    return `S${Math.max(this.config.projectInvoices.startNumber - 1, ...used) + 1}`;
  }

  /** The typed number (checked for uniqueness) or the next one. */
  async resolveInvoiceNumber(requested, ignoreId = null) {
    const number = requested?.trim();
    if (!number) return this.nextInvoiceNumber();
    const taken = unwrap(
      await this.db.from('project_invoices').select('id').ilike('invoice_number', number.replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle(),
    );
    if (taken && taken.id !== ignoreId) throw new ConflictException(`Invoice number ${number} is already used`);
    return number;
  }

  /** Changes an issued invoice's number and regenerates its PDF from the stored snapshot. */
  async renumber(id, { invoiceNumber }) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'void') throw new ConflictException('Void invoices cannot be renumbered');
    const number = await this.resolveInvoiceNumber(invoiceNumber, id);
    if (number === invoice.invoice_number) return invoice;

    const b = invoice.breakdown;
    const pdf = await renderProjectInvoicePdf({
      invoiceNumber: number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      currency: invoice.currency.trim(),
      project: b.project,
      calc: b,
      company: b.company || this.config.company,
      bank: b.bank || this.config.bank,
    });
    const { bucket } = this.config.invoices;
    const pdfPath = `projects/${invoice.project_id}/${number.replace(/\//g, '-')}.pdf`;
    const upload = await this.storage.from(bucket).upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
    if (upload.error) throw upload.error;

    const updated = unwrap(
      await this.db.from('project_invoices').update({ invoice_number: number, pdf_path: pdfPath }).eq('id', id).select().single(),
    );
    if (invoice.pdf_path && invoice.pdf_path !== pdfPath) await this.storage.from(bucket).remove([invoice.pdf_path]).catch(() => {});
    return updated;
  }

  async findOne(id) {
    return unwrap(await this.db.from('project_invoices').select('*').eq('id', id).maybeSingle(), 'Invoice not found');
  }

  /** Signed URL for the stored PDF; with `download`, the browser saves it as "INVOICE S2535.pdf". */
  async pdfUrl(id, { download = false } = {}) {
    const invoice = await this.findOne(id);
    if (!invoice.pdf_path) throw new UnprocessableEntityException('This invoice has no PDF');
    const fileName = `INVOICE ${invoice.invoice_number}.pdf`;
    return { invoiceNumber: invoice.invoice_number, fileName, pdfUrl: await this.signedUrl(invoice.pdf_path, download ? fileName : null) };
  }

  /** Renders the PDF for a preview without saving anything. */
  async draftPdf(dto) {
    const { calc, project, issueDate, dueDate } = await this.calculate(dto);
    const invoiceNumber = dto.invoiceNumber?.trim() || (await this.nextInvoiceNumber());
    const buffer = await renderProjectInvoicePdf({
      invoiceNumber, issueDate, dueDate, currency: project.currency.trim(), project, calc,
      company: this.config.company, bank: this.config.bank,
    });
    return { buffer, fileName: `INVOICE ${invoiceNumber}.pdf` };
  }

  /** Permanently deletes the invoice and its PDF from storage. */
  async remove(id) {
    const invoice = await this.findOne(id);
    if (invoice.pdf_path) {
      const { error } = await this.storage.from(this.config.invoices.bucket).remove([invoice.pdf_path]);
      if (error) throw error;
    }
    unwrap(await this.db.from('project_invoices').delete().eq('id', id).select('id').maybeSingle(), 'Invoice not found');
    return { deleted: true, invoiceNumber: invoice.invoice_number, pdfRemoved: Boolean(invoice.pdf_path) };
  }

  /** Records that the payment was received. */
  async markPaid(id, { paidOn, reference, note }, actor) {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'issued') throw new ConflictException(`Only issued invoices can be marked as paid (this one is ${invoice.status})`);
    return unwrap(
      await this.db
        .from('project_invoices')
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
        .from('project_invoices')
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
        .from('project_invoices')
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

  defaultDueDate(issueDate) {
    const [y, m] = issueDate.split('-').map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const day = Math.min(this.config.projectInvoices.dueDayOfNextMonth, daysInMonth(ny, nm));
    return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  async calculate(dto) {
    const project = unwrap(
      await this.db.from('projects').select('*').eq('id', dto.projectId).maybeSingle(),
      'Project not found',
    );

    const period = dto.month
      ? billingPeriod(dto.month, project.billing_cycle_start_day)
      : { start: dto.periodStart, end: dto.periodEnd };
    if (period.end < period.start) throw new BadRequestException('periodEnd must be on or after periodStart');
    if (daysBetween(period.start, period.end) > MAX_PERIOD_DAYS) {
      throw new BadRequestException(`A billing period cannot exceed ${MAX_PERIOD_DAYS} days`);
    }

    let assignments = unwrap(
      await this.db
        .from('project_assignments')
        .select('id, employee_id, start_date, end_date, monthly_rate, role_title, employee:employees(*)')
        .eq('project_id', project.id)
        .lte('start_date', period.end)
        .or(`end_date.is.null,end_date.gte.${period.start}`)
        .order('start_date'),
    );
    if (dto.employeeIds?.length) {
      const wanted = new Set(dto.employeeIds);
      assignments = assignments.filter((a) => wanted.has(a.employee_id));
    }

    const employeeIds = [...new Set(assignments.map((a) => a.employee_id))];
    const [holidays, attendance] = await Promise.all([
      this.db
        .from('holidays')
        .select('date')
        .gte('date', period.start)
        .lte('date', period.end)
        .or(`project_id.is.null,project_id.eq.${project.id}`)
        .then((r) => unwrap(r)),
      employeeIds.length
        ? fetchAll(() =>
            this.db
              .from('attendance')
              .select('employee_id, date, status')
              .in('employee_id', employeeIds)
              .gte('date', period.start)
              .lte('date', period.end)
              .order('date')
              .order('employee_id'),
          )
        : [],
    ]);

    const members = employeeIds
      .map((id) => {
        const rows = assignments.filter((a) => a.employee_id === id);
        return {
          employee: rows[0].employee,
          assignments: rows,
          attendance: attendance.filter((a) => a.employee_id === id),
        };
      })
      .sort((a, b) => {
        const rank = (m) => {
          const i = (dto.order || []).indexOf(m.employee.id);
          return i === -1 ? Number.MAX_SAFE_INTEGER : i;
        };
        return rank(a) - rank(b) || a.employee.full_name.localeCompare(b.employee.full_name);
      });

    let calc;
    try {
      calc = calculateProjectInvoice({
        periodStart: period.start,
        periodEnd: period.end,
        weekendDays: project.weekend_days,
        holidays,
        members,
        overrides: Object.fromEntries((dto.overrides || []).map((o) => [o.employeeId, o.text])),
        extraLines: dto.extraLines || [],
        namePrefix: this.config.projectInvoices.namePrefix,
        perDayDecimals: this.config.projectInvoices.perDayDecimals,
      });
    } catch (err) {
      if (err instanceof ProjectInvoiceError) {
        throw new UnprocessableEntityException({ statusCode: 422, error: err.code, message: err.message });
      }
      throw err;
    }

    const issueDate = dto.issueDate || formatDate(new Date());
    const dueDate = dto.dueDate || this.defaultDueDate(issueDate);
    return { calc, project, issueDate, dueDate };
  }
}
