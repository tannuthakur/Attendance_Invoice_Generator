import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const ATTENDANCE_STATUSES = ['present', 'half_day', 'paid_leave', 'absent'];

export class MarkAttendanceDto {
  @IsUUID() employeeId;
  @IsDateString({ strict: true }) date;
  @IsEnum(ATTENDANCE_STATUSES) status;
  @IsOptional() @IsString() @MaxLength(500) notes;
}

export class BulkAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MarkAttendanceDto)
  marks;
}

export class ListAttendanceQuery {
  /** Omit to get every employee (range limited to 62 days). */
  @IsOptional() @IsUUID() employeeId;
  /** Only employees assigned to this project during the range. */
  @IsOptional() @IsUUID() projectId;
  @IsDateString({ strict: true }) from;
  @IsDateString({ strict: true }) to;
}
