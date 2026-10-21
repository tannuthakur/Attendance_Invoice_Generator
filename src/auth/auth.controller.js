import { Controller, Dependencies, Post, Get, Body, Bind, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, ForgotPasswordDto, ResetPasswordDto } from './auth.dto';
import { Public, Permission, CurrentUser } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('auth')
@Dependencies(AuthService)
export class AuthController {
  constructor(auth) {
    this.auth = auth;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @Bind(Body(validated(LoginDto)))
  login(dto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Bind(Body(validated(RefreshDto)))
  refresh(dto) {
    return this.auth.refresh(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  @Bind(Body(validated(ForgotPasswordDto)))
  forgotPassword(dto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  @Bind(Body(validated(ResetPasswordDto)))
  resetPassword(dto) {
    return this.auth.resetPassword(dto);
  }

  @Get('me')
  @Permission('profile:read')
  @Bind(CurrentUser())
  me(user) {
    return this.auth.getProfile(user.id);
  }
}
