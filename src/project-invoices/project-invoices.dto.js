import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength,
  ValidateIf, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MONTH_REGEX, PaginationQuery } from '../common/dto';

export class LineOverrideDto {
  @IsUUID() employeeId;
  @IsString() @IsNotEmpty() @MaxLength(300) text;
}

export class ExtraLineDto {
  @IsString() @IsNotEmpty() @MaxLength(300) description;
  /** May be negative (e.g. a discount). */
  @IsNumber({ maxDecimalPlaces: 2 }) amount;
}

/** Either `month` (period from the project's billing cycle) or explicit `periodStart` + `periodEnd`. */
export class CreateProjectInvoiceDto {
  @IsUUID() projectId;

  @ValidateIf((o) => !o.periodStart && !o.periodEnd)
  @Matches(MONTH_REGEX, { message: 'month must be in YYYY-MM format (or give periodStart and periodEnd)' })
  month;

  @ValidateIf((o) => !o.month || o.periodEnd) @IsDateString({ strict: true }) periodStart;
  @ValidateIf((o) => !o.month || o.periodStart) @IsDateString({ strict: true }) periodEnd;

  /** Limit the invoice to these employees (default: everyone on the project in the period). */
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) employeeIds;

  /** Employee ids in the order their lines should appear (others follow, by name). */
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) order;

  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => LineOverrideDto) overrides;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ExtraLineDto) extraLines;

  @IsOptional() @IsDateString({ strict: true }) issueDate;
  @IsOptional() @IsDateString({ strict: true }) dueDate;

  /** Letters, digits, - and /; e.g. S2535. Leave empty for the next number. */
  @IsOptional() @IsString() @MaxLength(30) @Matches(/^[A-Za-z0-9][A-Za-z0-9\-/]*$/, { message: 'Invoice number may contain only letters, digits, - and /' })
  invoiceNumber;
}

export class RenumberProjectInvoiceDto {
  @IsString() @IsNotEmpty() @MaxLength(30) @Matches(/^[A-Za-z0-9][A-Za-z0-9\-/]*$/, { message: 'Invoice number may contain only letters, digits, - and /' })
  invoiceNumber;
}

export class ListProjectInvoicesQuery extends PaginationQuery {
  @IsOptional() @IsUUID() projectId;
  @IsOptional() @IsEnum(['issued', 'paid', 'void']) status;
  /** Invoices whose period ends on/after this date. */
  @IsOptional() @IsDateString({ strict: true }) from;
  /** Invoices whose period starts on/before this date. */
  @IsOptional() @IsDateString({ strict: true }) to;
  /** Invoice number contains. */
  @IsOptional() @IsString() @MaxLength(50) search;
}

export class MarkPaidDto {
  /** Date the payment was received. */
  @IsDateString({ strict: true }) paidOn;
  /** Bank / transaction reference. */
  @IsOptional() @IsString() @MaxLength(100) reference;
  @IsOptional() @IsString() @MaxLength(500) note;
}
