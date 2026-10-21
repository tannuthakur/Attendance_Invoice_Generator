import { Injectable, Dependencies, BadRequestException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap, paginate, ilikeTerm } from '../common/utils/db';
import { toRow } from '../common/utils/case';
import { formatDate } from '../common/utils/dates';
import { EMPLOYEE_COLUMNS } from './employees.dto';

@Injectable()
@Dependencies(SupabaseService)
export class EmployeesService {
  constructor(supabase) {
    this.db = supabase.admin;
  }

  async list({ page, limit, status, search, projectId, department, designation, joinedFrom, joinedTo }) {
    const { from, to } = paginate(page, limit);
    let query = this.db
      .from('employees')
      .select('*', { count: 'exact' })
      .order('full_name')
      .range(from, to);

    if (status) query = query.eq('employment_status', status);
    if (department) query = query.eq('department', department);
    if (designation) query = query.eq('designation', designation);
    if (joinedFrom) query = query.gte('date_of_joining', joinedFrom);
    if (joinedTo) query = query.lte('date_of_joining', joinedTo);
    if (search?.trim()) {
      const term = ilikeTerm(search);
      query = query.or(`full_name.ilike.${term},employee_code.ilike.${term},email.ilike.${term}`);
    }
    if (projectId) {
      const assignments = unwrap(
        await this.db.from('project_assignments').select('employee_id').eq('project_id', projectId),
      );
      const ids = [...new Set(assignments.map((a) => a.employee_id))];
      if (!ids.length) return { data: [], page, limit, total: 0 };
      query = query.in('id', ids);
    }

    const { data, count, error } = await query;
    unwrap({ data, error });
    return { data, page, limit, total: count };
  }

  async findOne(id) {
    const employee = unwrap(
      await this.db
        .from('employees')
        .select('*, assignments:project_assignments(*, project:projects(id, name, client_name))')
        .eq('id', id)
        .maybeSingle(),
      'Employee not found',
    );
    const today = formatDate(new Date());
    const currentSalary = unwrap(
      await this.db
        .from('salaries')
        .select('effective_month, monthly_amount, currency')
        .eq('employee_id', id)
        .lte('effective_month', today)
        .order('effective_month', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return { ...employee, current_salary: currentSalary };
  }

  async assertExists(id) {
    unwrap(await this.db.from('employees').select('id').eq('id', id).maybeSingle(), 'Employee not found');
  }

  async create(dto) {
    return unwrap(await this.db.from('employees').insert(toRow(dto, EMPLOYEE_COLUMNS)).select().single());
  }

  async update(id, dto) {
    const row = toRow(dto, EMPLOYEE_COLUMNS);
    if (!Object.keys(row).length) throw new BadRequestException('No fields to update');
    return unwrap(await this.db.from('employees').update(row).eq('id', id).select().maybeSingle(), 'Employee not found');
  }

  async updateStatus(id, { status, effectiveDate }) {
    let row;
    if (status === 'off_role') {
      if (!effectiveDate) throw new BadRequestException('effectiveDate is required when removing from role');
      row = { employment_status: 'off_role', off_role_date: effectiveDate };
    } else {
      row = { employment_status: 'on_role', off_role_date: null };
      // Re-joining: treat effectiveDate as the new joining date.
      if (effectiveDate) row.date_of_joining = effectiveDate;
    }
    return unwrap(await this.db.from('employees').update(row).eq('id', id).select().maybeSingle(), 'Employee not found');
  }

  /** Distinct departments and designations, for filter dropdowns. */
  async facets() {
    const rows = unwrap(await this.db.from('employees').select('department, designation'));
    const distinct = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { departments: distinct('department'), designations: distinct('designation') };
  }

  /** What deleting this employee would remove, and what blocks it. */
  async usage(id) {
    await this.assertExists(id);
    const count = async (table, filter = (q) => q) => {
      const { count: n, error } = await filter(this.db.from(table).select('id', { count: 'exact', head: true }).eq('employee_id', id));
      if (error) unwrap({ data: null, error });
      return n || 0;
    };
    const [attendance, salaries, assignments, issuedInvoices, voidInvoices, logins] = await Promise.all([
      count('attendance'),
      count('salaries'),
      count('project_assignments'),
      count('invoices', (q) => q.eq('status', 'issued')),
      count('invoices', (q) => q.eq('status', 'void')),
      this.db.from('profiles').select('id', { count: 'exact', head: true }).eq('employee_id', id).then((r) => r.count || 0),
    ]);
    return {
      attendance, salaries, assignments, voidInvoices, logins, issuedInvoices,
      canDelete: issuedInvoices === 0,
      blockedReason: issuedInvoices
        ? `${issuedInvoices} issued salary invoice${issuedInvoices === 1 ? ' references' : 's reference'} this employee. Void ${issuedInvoices === 1 ? 'it' : 'them'} first, or use "Remove from role" to keep the history.`
        : null,
    };
  }

  /**
   * Permanently deletes the employee with their attendance, salaries, assignments and void salary invoices.
   * Linked logins are unlinked (the user account stays). Refused while an issued invoice exists.
   */
  async remove(id, storage, bucket) {
    const usage = await this.usage(id);
    if (!usage.canDelete) throw new ConflictException(usage.blockedReason);

    const voids = unwrap(await this.db.from('invoices').select('pdf_path').eq('employee_id', id).eq('status', 'void'));
    const paths = voids.map((v) => v.pdf_path).filter(Boolean);
    if (paths.length) await storage.from(bucket).remove(paths);

    unwrap(await this.db.from('invoices').delete().eq('employee_id', id).eq('status', 'void'));
    unwrap(await this.db.from('profiles').update({ employee_id: null }).eq('employee_id', id));
    for (const table of ['attendance', 'salaries', 'project_assignments']) {
      unwrap(await this.db.from(table).delete().eq('employee_id', id));
    }
    unwrap(await this.db.from('employees').delete().eq('id', id));
    return { deleted: true, removed: usage };
  }
}
