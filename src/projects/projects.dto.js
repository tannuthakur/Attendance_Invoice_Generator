import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID,
  Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const PROJECT_COLUMNS = {
  name: 'name',
  clientName: 'client_name',
  billingCycleStartDay: 'billing_cycle_start_day',
  weekendDays: 'weekend_days',
  currency: 'currency',
  clientContact: 'client_contact',
  invoiceTitle: 'invoice_title',
};

export class CreateProjectDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name;
  @IsOptional() @IsString() @MaxLength(200) clientName;
  @IsOptional() @IsInt() @Min(1) @Max(28) billingCycleStartDay;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(6) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  weekendDays;
  @IsOptional() @IsString() @Length(3, 3) currency;
  /** "To" line on client invoices, e.g. "Mr. Mohammed Al Arouqi". */
  @IsOptional() @IsString() @MaxLength(200) clientContact;
  /** Client invoice title after "INVOICE-", e.g. "Development Work Qatar Living". */
  @IsOptional() @IsString() @MaxLength(200) invoiceTitle;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name;
  @IsOptional() @IsString() @MaxLength(200) clientName;
  @IsOptional() @IsInt() @Min(1) @Max(28) billingCycleStartDay;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(6) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  weekendDays;
  @IsOptional() @IsString() @Length(3, 3) currency;
  /** "To" line on client invoices, e.g. "Mr. Mohammed Al Arouqi". */
  @IsOptional() @IsString() @MaxLength(200) clientContact;
  /** Client invoice title after "INVOICE-", e.g. "Development Work Qatar Living". */
  @IsOptional() @IsString() @MaxLength(200) invoiceTitle;
}

export class CreateAssignmentDto {
  @IsUUID() employeeId;
  @IsDateString({ strict: true }) startDate;
  @IsOptional() @IsDateString({ strict: true }) endDate;
  @IsOptional() @IsString() @MaxLength(100) roleTitle;
  /** Monthly amount billed to the client for this employee (project currency). */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) monthlyRate;
}

export class BulkAssignmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateAssignmentDto)
  assignments;
}

export class ReleaseAssignmentsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('all', { each: true }) assignmentIds;
  /** Last day on the project. */
  @IsDateString({ strict: true }) endDate;
}

export class UpdateAssignmentDto {
  @IsOptional() @IsDateString({ strict: true }) startDate;
  /** null re-opens the assignment. */
  @IsOptional() @IsDateString({ strict: true }) endDate;
  @IsOptional() @IsString() @MaxLength(100) roleTitle;
  /** null clears the rate. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) monthlyRate;
}
