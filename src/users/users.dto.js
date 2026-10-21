import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQuery } from '../common/dto';

export const ROLES = ['admin', 'user'];

export class CreateUserDto {
  @IsEmail() email;
  @IsOptional() @IsString() fullName;
  @IsEnum(ROLES) role = 'user';
  @IsOptional() @IsUUID() employeeId;
  /** If given, the user is created with this password instead of being emailed an invite. */
  @IsOptional() @IsString() @MinLength(8) password;
}

export class UpdateRoleDto {
  @IsEnum(ROLES) role;
}

export class ListUsersQuery extends PaginationQuery {
  @IsOptional() @IsString() @MaxLength(100) search;
  @IsOptional() @IsEnum(ROLES) role;
}
