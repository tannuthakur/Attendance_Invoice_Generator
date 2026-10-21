import { Injectable, Dependencies, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import { SupabaseService } from '../../supabase/supabase.service';
import { APP_CONFIG } from '../tokens';
import { IS_PUBLIC_KEY } from '../decorators';

export function extractBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

@Injectable()
@Dependencies(Reflector, SupabaseService, APP_CONFIG)
export class JwtAuthGuard {
  constructor(reflector, supabase, config) {
    this.reflector = reflector;
    this.supabase = supabase;
    this.config = config;
  }

  async canActivate(context) {
    const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const userId = await this.verify(token);
    const { data: profile, error } = await this.supabase.admin
      .from('profiles')
      .select('id, email, full_name, role, employee_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new UnauthorizedException('No profile for this user');

    req.user = {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      employeeId: profile.employee_id,
    };
    return true;
  }

  /** Returns the auth user id (JWT `sub`). */
  async verify(token) {
    const { jwtSecret } = this.config.supabase;
    if (jwtSecret) {
      try {
        const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], audience: 'authenticated' });
        return payload.sub;
      } catch {
        throw new UnauthorizedException('Invalid or expired token');
      }
    }
    // Projects on asymmetric signing keys: let Supabase Auth validate the token.
    const { data, error } = await this.supabase.admin.auth.getUser(token);
    if (error || !data?.user) throw new UnauthorizedException('Invalid or expired token');
    return data.user.id;
  }
}
