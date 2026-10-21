import { Injectable, Dependencies, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { APP_CONFIG } from '../common/tokens';
import { unwrap, paginate, ilikeTerm } from '../common/utils/db';

const PROFILE_COLUMNS = 'id, email, full_name, role, employee_id, created_at, updated_at';

@Injectable()
@Dependencies(SupabaseService, APP_CONFIG)
export class UsersService {
  constructor(supabase, config) {
    this.supabase = supabase;
    this.config = config;
  }

  async list({ page, limit, role, search }) {
    const { from, to } = paginate(page, limit);
    let query = this.supabase.admin
      .from('profiles')
      .select(`${PROFILE_COLUMNS}, employee:employees(employee_code, full_name)`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (role) query = query.eq('role', role);
    if (search?.trim()) query = query.or(`email.ilike.${ilikeTerm(search)},full_name.ilike.${ilikeTerm(search)}`);
    const { data, count, error } = await query;
    unwrap({ data, error });
    return { data, page, limit, total: count };
  }

  async create({ email, fullName, role, employeeId, password }) {
    if (employeeId) await this.assertEmployeeLinkable(employeeId);

    const auth = this.supabase.admin.auth.admin;
    const metadata = { full_name: fullName };
    const { data, error } = password
      ? await auth.createUser({ email, password, email_confirm: true, user_metadata: metadata })
      : await auth.inviteUserByEmail(email, { data: metadata, redirectTo: this.config.auth.inviteRedirectUrl });
    if (error) {
      if (/already/i.test(error.message)) throw new ConflictException('A user with this email already exists');
      throw new BadRequestException(error.message);
    }

    // The on_auth_user_created trigger inserts the profile; upsert in case it has not run.
    return unwrap(
      await this.supabase.admin
        .from('profiles')
        .upsert({ id: data.user.id, email, full_name: fullName ?? null, role, employee_id: employeeId ?? null })
        .select(PROFILE_COLUMNS)
        .single(),
    );
  }

  async updateRole(id, role, actor) {
    if (id === actor.id && role !== 'admin') {
      throw new BadRequestException('You cannot remove your own admin role');
    }
    return unwrap(
      await this.supabase.admin.from('profiles').update({ role }).eq('id', id).select(PROFILE_COLUMNS).maybeSingle(),
      'User not found',
    );
  }

  async assertEmployeeLinkable(employeeId) {
    const employee = unwrap(
      await this.supabase.admin.from('employees').select('id').eq('id', employeeId).maybeSingle(),
    );
    if (!employee) throw new NotFoundException('Employee not found');
    const linked = unwrap(
      await this.supabase.admin.from('profiles').select('id').eq('employee_id', employeeId).maybeSingle(),
    );
    if (linked) throw new ConflictException('This employee is already linked to another user');
  }
}
