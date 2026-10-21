import { Injectable, Dependencies } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from '../common/utils/db';

// Where each kind of option is used.
const USAGE = {
  designation: { table: 'employees', column: 'designation' },
  role: { table: 'project_assignments', column: 'role_title' },
};

@Injectable()
@Dependencies(SupabaseService)
export class OptionsService {
  constructor(supabase) {
    this.db = supabase.admin;
  }

  /** Options with how many records use each one. */
  async list({ kind }) {
    let query = this.db.from('job_options').select('*').order('name');
    if (kind) query = query.eq('kind', kind);
    const options = unwrap(await query);

    const counts = {};
    for (const [k, { table, column }] of Object.entries(USAGE)) {
      if (kind && kind !== k) continue;
      const rows = unwrap(await this.db.from(table).select(column).not(column, 'is', null));
      counts[k] = rows.reduce((acc, r) => {
        const key = r[column].trim().toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    }
    return options.map((o) => ({ ...o, used_by: counts[o.kind]?.[o.name.trim().toLowerCase()] || 0 }));
  }

  async create({ kind, name }) {
    return unwrap(await this.db.from('job_options').insert({ kind, name: name.trim() }).select().single());
  }

  async update(id, { name, applyToExisting = true }) {
    const current = unwrap(await this.db.from('job_options').select('*').eq('id', id).maybeSingle(), 'Option not found');
    const updated = unwrap(
      await this.db.from('job_options').update({ name: name.trim() }).eq('id', id).select().single(),
    );
    let renamed = 0;
    if (applyToExisting && current.name !== updated.name) {
      const { table, column } = USAGE[current.kind];
      const rows = unwrap(
        await this.db.from(table).update({ [column]: updated.name }).eq(column, current.name).select('id'),
      );
      renamed = rows.length;
    }
    return { ...updated, renamed };
  }

  /** Removes the option only; records that use the name keep it as text. */
  async remove(id) {
    unwrap(await this.db.from('job_options').delete().eq('id', id).select('id').maybeSingle(), 'Option not found');
  }
}
