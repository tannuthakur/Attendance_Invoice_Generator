import { Injectable, Dependencies, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { APP_CONFIG } from '../common/tokens';
import { unwrap } from '../common/utils/db';
import { toRow } from '../common/utils/case';
import { PROJECT_COLUMNS } from './projects.dto';

@Injectable()
@Dependencies(SupabaseService, APP_CONFIG)
export class ProjectsService {
  constructor(supabase, config) {
    this.db = supabase.admin;
    this.config = config;
  }

  async list() {
    return unwrap(await this.db.from('projects').select('*').order('name'));
  }

  async findOne(id) {
    return unwrap(await this.db.from('projects').select('*').eq('id', id).maybeSingle(), 'Project not found');
  }

  async create(dto) {
    const row = { currency: this.config.invoices.defaultCurrency, ...toRow(dto, PROJECT_COLUMNS) };
    if (row.currency) row.currency = row.currency.toUpperCase();
    return unwrap(await this.db.from('projects').insert(row).select().single());
  }

  async update(id, dto) {
    const row = toRow(dto, PROJECT_COLUMNS);
    if (!Object.keys(row).length) throw new BadRequestException('No fields to update');
    if (row.currency) row.currency = row.currency.toUpperCase();
    return unwrap(await this.db.from('projects').update(row).eq('id', id).select().maybeSingle(), 'Project not found');
  }

  async listAssignments(projectId) {
    await this.findOne(projectId);
    return unwrap(
      await this.db
        .from('project_assignments')
        .select('*, employee:employees(id, employee_code, full_name)')
        .eq('project_id', projectId)
        .order('start_date'),
    );
  }

  async assign(projectId, { employeeId, startDate, endDate, roleTitle, monthlyRate }) {
    if (endDate && endDate < startDate) throw new BadRequestException('endDate must be on or after startDate');
    await this.findOne(projectId);
    await this.assertNoOverlap(projectId, employeeId, startDate, endDate ?? null);

    return unwrap(
      await this.db
        .from('project_assignments')
        .insert({
          project_id: projectId,
          employee_id: employeeId,
          start_date: startDate,
          end_date: endDate ?? null,
          role_title: roleTitle ?? null,
          monthly_rate: monthlyRate ?? null,
        })
        .select()
        .single(),
    );
  }

  /**
   * Assigns several employees in one go. Everything is validated first and inserted in a
   * single statement, so either all assignments are created or none are.
   */
  async assignMany(projectId, { assignments }) {
    await this.findOne(projectId);

    const ids = assignments.map((a) => a.employeeId);
    const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
    if (duplicate) throw new BadRequestException('The same employee appears twice in the list');

    const employees = unwrap(
      await this.db.from('employees').select('id, full_name, employment_status').in('id', ids),
    );
    const byId = new Map(employees.map((e) => [e.id, e]));
    const existing = unwrap(
      await this.db.from('project_assignments').select('employee_id, start_date, end_date').eq('project_id', projectId).in('employee_id', ids),
    );

    const problems = [];
    for (const a of assignments) {
      const emp = byId.get(a.employeeId);
      const name = emp?.full_name || a.employeeId;
      if (!emp) problems.push(`${name}: employee not found`);
      else if (emp.employment_status === 'off_role') problems.push(`${name}: is off role`);
      if (a.endDate && a.endDate < a.startDate) problems.push(`${name}: end date is before start date`);
      const overlaps = existing.some(
        (x) => x.employee_id === a.employeeId && (!x.end_date || x.end_date >= a.startDate) && (!a.endDate || x.start_date <= a.endDate),
      );
      if (overlaps) problems.push(`${name}: already has an overlapping assignment on this project`);
    }
    if (problems.length) throw new BadRequestException(problems);

    const rows = unwrap(
      await this.db
        .from('project_assignments')
        .insert(
          assignments.map((a) => ({
            project_id: projectId,
            employee_id: a.employeeId,
            start_date: a.startDate,
            end_date: a.endDate ?? null,
            role_title: a.roleTitle ?? null,
            monthly_rate: a.monthlyRate ?? null,
          })),
        )
        .select(),
    );
    return { count: rows.length, data: rows };
  }

  /** Ends assignments on `endDate` (their last day on the project). History is kept. */
  async release(projectId, { assignmentIds, endDate }) {
    await this.findOne(projectId);
    const rows = unwrap(
      await this.db
        .from('project_assignments')
        .select('id, start_date, end_date, employee:employees(full_name)')
        .eq('project_id', projectId)
        .in('id', assignmentIds),
    );
    if (rows.length !== new Set(assignmentIds).size) throw new NotFoundException('One or more assignments were not found on this project');
    const tooEarly = rows.filter((r) => endDate < r.start_date);
    if (tooEarly.length) {
      throw new BadRequestException(
        tooEarly.map((r) => `${r.employee?.full_name}: started on ${r.start_date}, so the release date can't be earlier`),
      );
    }
    const updated = unwrap(
      await this.db.from('project_assignments').update({ end_date: endDate }).in('id', assignmentIds).select(),
    );
    return { count: updated.length, data: updated };
  }

  /** Deletes an assignment entirely (for mistakes). Issued client invoices keep their printed lines. */
  async removeAssignment(projectId, assignmentId) {
    unwrap(
      await this.db.from('project_assignments').delete().eq('id', assignmentId).eq('project_id', projectId).select('id').maybeSingle(),
      'Assignment not found',
    );
  }

  async updateAssignment(projectId, assignmentId, dto) {
    const current = unwrap(
      await this.db
        .from('project_assignments')
        .select('*')
        .eq('id', assignmentId)
        .eq('project_id', projectId)
        .maybeSingle(),
    );
    if (!current) throw new NotFoundException('Assignment not found');

    const startDate = dto.startDate ?? current.start_date;
    const endDate = dto.endDate !== undefined ? dto.endDate : current.end_date;
    if (endDate && endDate < startDate) throw new BadRequestException('endDate must be on or after startDate');
    await this.assertNoOverlap(projectId, current.employee_id, startDate, endDate, assignmentId);

    const row = { start_date: startDate, end_date: endDate };
    if (dto.roleTitle !== undefined) row.role_title = dto.roleTitle;
    if (dto.monthlyRate !== undefined) row.monthly_rate = dto.monthlyRate;
    return unwrap(await this.db.from('project_assignments').update(row).eq('id', assignmentId).select().single());
  }

  /** Rejects overlapping assignments of the same employee to the same project. */
  async assertNoOverlap(projectId, employeeId, startDate, endDate, ignoreId = null) {
    const existing = unwrap(
      await this.db
        .from('project_assignments')
        .select('id, start_date, end_date')
        .eq('project_id', projectId)
        .eq('employee_id', employeeId),
    );
    const overlaps = existing.some(
      (a) => a.id !== ignoreId && (!a.end_date || a.end_date >= startDate) && (!endDate || a.start_date <= endDate),
    );
    if (overlaps) throw new BadRequestException('Employee already has an overlapping assignment on this project');
  }

  /** What deleting this project would remove, and what blocks it. */
  async usage(id) {
    await this.findOne(id);
    const count = async (table, filter = (q) => q) => {
      const { count: n, error } = await filter(this.db.from(table).select('id', { count: 'exact', head: true }).eq('project_id', id));
      if (error) unwrap({ data: null, error });
      return n || 0;
    };
    const [assignments, holidays, issuedSalaryInvoices, voidSalaryInvoices, issuedClientInvoices, voidClientInvoices] = await Promise.all([
      count('project_assignments'),
      count('holidays'),
      count('invoices', (q) => q.eq('status', 'issued')),
      count('invoices', (q) => q.eq('status', 'void')),
      count('project_invoices', (q) => q.eq('status', 'issued')),
      count('project_invoices', (q) => q.eq('status', 'void')),
    ]);
    const issued = issuedSalaryInvoices + issuedClientInvoices;
    return {
      assignments, holidays, issuedSalaryInvoices, issuedClientInvoices,
      voidInvoices: voidSalaryInvoices + voidClientInvoices,
      canDelete: issued === 0,
      blockedReason: issued
        ? `${issued} issued invoice${issued === 1 ? ' belongs' : 's belong'} to this project. Void ${issued === 1 ? 'it' : 'them'} first.`
        : null,
    };
  }

  /** Permanently deletes the project with its assignments, project holidays and void invoices. */
  async remove(id, storage, bucket) {
    const usage = await this.usage(id);
    if (!usage.canDelete) throw new ConflictException(usage.blockedReason);

    const voidSalary = unwrap(await this.db.from('invoices').select('pdf_path').eq('project_id', id).eq('status', 'void'));
    const voidClient = unwrap(await this.db.from('project_invoices').select('pdf_path').eq('project_id', id).eq('status', 'void'));
    const paths = [...voidSalary, ...voidClient].map((v) => v.pdf_path).filter(Boolean);
    if (paths.length) await storage.from(bucket).remove(paths);

    for (const table of ['invoices', 'project_invoices']) {
      unwrap(await this.db.from(table).delete().eq('project_id', id).eq('status', 'void'));
    }
    for (const table of ['project_assignments', 'holidays']) {
      unwrap(await this.db.from(table).delete().eq('project_id', id));
    }
    unwrap(await this.db.from('projects').delete().eq('id', id));
    return { deleted: true, removed: usage };
  }
}
