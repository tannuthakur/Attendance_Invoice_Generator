import { Controller, Dependencies, Get, Post, Body, Query, Bind } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, BulkAttendanceDto, ListAttendanceQuery } from './attendance.dto';
import { Permission, OwnedBy, CurrentUser } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('attendance')
@Dependencies(AttendanceService)
export class AttendanceController {
  constructor(attendance) {
    this.attendance = attendance;
  }

  @Post()
  @Permission('attendance:write')
  @OwnedBy({ body: 'employeeId' })
  @Bind(Body(validated(MarkAttendanceDto)), CurrentUser())
  mark(dto, user) {
    return this.attendance.mark(dto, user);
  }

  @Post('bulk')
  @Permission('attendance:bulk')
  @Bind(Body(validated(BulkAttendanceDto)), CurrentUser())
  bulk(dto, user) {
    return this.attendance.bulk(dto, user);
  }

  @Get()
  @Permission('attendance:read')
  @OwnedBy({ query: 'employeeId' })
  @Bind(Query(validated(ListAttendanceQuery)))
  list(query) {
    return this.attendance.list(query);
  }
}
