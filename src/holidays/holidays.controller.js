import { Controller, Dependencies, Get, Post, Delete, Body, Param, Query, Bind, HttpCode, ParseUUIDPipe } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto, ListHolidaysQuery } from './holidays.dto';
import { Permission } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('holidays')
@Dependencies(HolidaysService)
export class HolidaysController {
  constructor(holidays) {
    this.holidays = holidays;
  }

  @Get()
  @Permission('holidays:read')
  @Bind(Query(validated(ListHolidaysQuery)))
  list(query) {
    return this.holidays.list(query);
  }

  @Post()
  @Permission('holidays:write')
  @Bind(Body(validated(CreateHolidayDto)))
  create(dto) {
    return this.holidays.create(dto);
  }

  @Delete(':id')
  @Permission('holidays:write')
  @HttpCode(204)
  @Bind(Param('id', ParseUUIDPipe))
  remove(id) {
    return this.holidays.remove(id);
  }
}
