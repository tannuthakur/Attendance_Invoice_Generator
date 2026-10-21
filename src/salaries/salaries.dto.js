import { IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { MONTH_REGEX } from '../common/dto';

export class CreateSalaryDto {
  @IsUUID() employeeId;
  /** 'YYYY-MM' — the salary applies from the first day of this month. */
  @Matches(MONTH_REGEX, { message: 'month must be in YYYY-MM format' }) month;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9_999_999_999.99) monthlyAmount;
  @IsOptional() @IsString() @Length(3, 3) currency;
}

export class ListSalariesQuery {
  @IsUUID() employeeId;
}
