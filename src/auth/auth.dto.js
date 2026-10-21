import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @IsEmail() email;
  @IsString() @IsNotEmpty() password;
}

export class RefreshDto {
  @IsString() @IsNotEmpty() refreshToken;
}

export class ForgotPasswordDto {
  @IsEmail() email;
}

/**
 * Supabase recovery links carry either an access token (implicit flow, `#access_token=…`)
 * or a token hash (PKCE / email template `{{ .TokenHash }}`). Send whichever the client received.
 */
export class ResetPasswordDto {
  @ValidateIf((o) => !o.tokenHash) @IsString() @IsNotEmpty() accessToken;
  @ValidateIf((o) => !o.accessToken) @IsString() @IsNotEmpty() tokenHash;
  @IsString() @MinLength(8) newPassword;
  @IsOptional() @IsString() email;
}
