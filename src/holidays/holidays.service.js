import { Injectable, Dependencies } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from '../common/utils/db';

@Injectable()
@Dependencies(SupabaseService)
export class HolidaysService {
  constructor(supabase) {
    this.db = supabase.admin;
  }

  async list({ from, to, projectId }) {
    let query = this.db.from('holidays').select('*').order('date');
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (projectId) query = query.or(`project_id.is.null,project_id.eq.${projectId}`);
    return unwrap(await query);
  }

  async create({ date, name, projectId }) {
    return unwrap(
      await this.db.from('holidays').insert({ date, name, project_id: projectId ?? null }).select().single(),
    );
  }

  async remove(id) {
    unwrap(await this.db.from('holidays').delete().eq('id', id).select('id').maybeSingle(), 'Holiday not found');
  }
}
