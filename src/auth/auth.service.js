import { Injectable, Dependencies, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { APP_CONFIG } from '../common/tokens';
import { unwrap } from '../common/utils/db';

const toTokens = (session) => ({
  accessToken: session.access_token,
  refreshToken: session.refresh_token,
  expiresIn: session.expires_in,
  expiresAt: session.expires_at,
  tokenType: session.token_type,
});

@Injectable()
@Dependencies(SupabaseService, APP_CONFIG)
export class AuthService {
  logger = new Logger(AuthService.name);

  constructor(supabase, config) {
    this.supabase = supabase;
    this.config = config;
  }

  async login({ email, password }) {
    const { data, error } = await this.supabase.anon().auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new UnauthorizedException('Invalid email or password');
    const profile = await this.getProfile(data.user.id);
    return { ...toTokens(data.session), user: profile };
  }

  async refresh({ refreshToken }) {
    const { data, error } = await this.supabase.anon().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new UnauthorizedException('Invalid or expired refresh token');
    return toTokens(data.session);
  }

  async forgotPassword({ email }) {
    const { error } = await this.supabase.anon().auth.resetPasswordForEmail(email, {
      redirectTo: this.config.auth.passwordResetRedirectUrl,
    });
    // Never reveal whether the email exists.
    if (error) this.logger.warn(`Password reset email failed: ${error.message}`);
    return { message: 'If an account exists for that email, a reset link has been sent.' };
  }

  async resetPassword({ accessToken, tokenHash, newPassword }) {
    let userId;
    if (tokenHash) {
      const { data, error } = await this.supabase.anon().auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
      if (error || !data.user) throw new BadRequestException('Invalid or expired recovery token');
      userId = data.user.id;
    } else {
      const { data, error } = await this.supabase.admin.auth.getUser(accessToken);
      if (error || !data.user) throw new BadRequestException('Invalid or expired recovery token');
      userId = data.user.id;
    }

    const { error } = await this.supabase.admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw new BadRequestException(error.message);
    return { message: 'Password updated. Please sign in with your new password.' };
  }

  async getProfile(userId) {
    return unwrap(
      await this.supabase.admin
        .from('profiles')
        .select('id, email, full_name, role, employee_id, employee:employees(*)')
        .eq('id', userId)
        .maybeSingle(),
      'Profile not found',
    );
  }
}
