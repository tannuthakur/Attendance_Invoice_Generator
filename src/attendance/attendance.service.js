import { Injectable, Dependencies, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap, fetchAll } from '../common/utils/db';
import { daysBetween } from '../common/utils/dates';

const MAX_RANGE_DAYS = 366;
const MAX_MULTI_EMPLOYEE_RANGE_DAYS = 62;

const toRow = (mark, actor) => ({
  employee_id: mark.employeeId,
  date: mark.date,
  status: mark.status,
  notes: mark.notes ?? null,
  marked_by: actor.id,
});

@Injectable()
@Dependencies(SupabaseService)
export class AttendanceService {
  constructor(supabase) {
    this.db = supabase.admin;
  }

  /** Insert or correct a single mark (unique on employee + date). */
  async mark(dto, actor) {
    return unwrap(
      await this.db.from('attendance').upsert(toRow(dto, actor), { onConflict: 'employee_id,date' }).select().single(),
    );
  }

  async bulk({ marks }, actor) {
    const keys = new Set();
    for (const m of marks) {
      const key = `${m.employeeId}|${m.date}`;
      if (keys.has(key)) throw new BadRequestException(`Duplicate mark for employee ${m.employeeId} on ${m.date}`);
      keys.add(key);
    }
    const rows = unwrap(
      await this.db
        .from('attendance')
        .upsert(marks.map((m) => toRow(m, actor)), { onConflict: 'employee_id,date' })
        .select(),
    );
    return { count: rows.length, data: rows };
  }

  async list({ employeeId, projectId, from, to }) {
    if (to < from) throw new BadRequestException('"to" must be on or after "from"');
    const maxDays = employeeId ? MAX_RANGE_DAYS : MAX_MULTI_EMPLOYEE_RANGE_DAYS;
    if (daysBetween(from, to) > maxDays) throw new BadRequestException(`Range cannot exceed ${maxDays} days`);

    let employeeIds = employeeId ? [employeeId] : null;
    if (projectId) {
      const assignments = unwrap(
        await this.db
          .from('project_assignments')
          .select('employee_id')
          .eq('project_id', projectId)
          .lte('start_date', to)
          .or(`end_date.is.null,end_date.gte.${from}`),
      );
      const assigned = new Set(assignments.map((a) => a.employee_id));
      employeeIds = employeeIds ? employeeIds.filter((id) => assigned.has(id)) : [...assigned];
      if (!employeeIds.length) return [];
    }

    return fetchAll(() => {
      let query = this.db
        .from('attendance')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .order('employee_id');
      if (employeeIds) query = query.in('employee_id', employeeIds);
      return query;
    });
  }
}
