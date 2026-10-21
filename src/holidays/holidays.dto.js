import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateHolidayDto {
  @IsDateString({ strict: true }) date;
  @IsString() @IsNotEmpty() @MaxLength(200) name;
  /** Omit for a holiday that applies to all projects. */
  @IsOptional() @IsUUID() projectId;
}

export class ListHolidaysQuery {
  @IsOptional() @IsDateString({ strict: true }) from;
  @IsOptional() @IsDateString({ strict: true }) to;
  /** Returns global holidays plus this project's. */
  @IsOptional() @IsUUID() projectId;
}
