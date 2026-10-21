import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches,
  MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MONTH_REGEX, PaginationQuery } from '../common/dto';

export class AdjustmentDto {
  @IsEnum(['allowance', 'deduction']) type;
  @IsString() @IsNotEmpty() @MaxLength(100) label;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount;
}

/** Either `month` (billing period derived from the project's cycle) or explicit `periodStart` + `periodEnd`. */
export class CreateInvoiceDto {
  @IsUUID() employeeId;
  @IsUUID() projectId;

  @ValidateIf((o) => !o.periodStart && !o.periodEnd)
  @Matches(MONTH_REGEX, { message: 'month must be in YYYY-MM format (or give periodStart and periodEnd)' })
  month;

  @ValidateIf((o) => !o.month || o.periodEnd) @IsDateString({ strict: true }) periodStart;
  @ValidateIf((o) => !o.month || o.periodStart) @IsDateString({ strict: true }) periodEnd;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentDto)
  adjustments = [];
}

export class ListInvoicesQuery extends PaginationQuery {
  @IsOptional() @IsUUID() employeeId;
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
