import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const OPTION_KINDS = ['designation', 'role'];

export class ListOptionsQuery {
  @IsOptional() @IsEnum(OPTION_KINDS) kind;
}

export class CreateOptionDto {
  @IsEnum(OPTION_KINDS) kind;
  @IsString() @IsNotEmpty() @MaxLength(100) name;
}

export class UpdateOptionDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name;
  /** Also rename it on employees (designation) or assignments (role) that use the old name. Default true. */
  @IsOptional() @IsBoolean() applyToExisting;
}
