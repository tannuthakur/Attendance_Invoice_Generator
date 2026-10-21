import { Controller, Dependencies, Get, Post, Patch, Delete, Body, Param, Query, Bind, HttpCode, ParseUUIDPipe } from '@nestjs/common';
import { OptionsService } from './options.service';
import { CreateOptionDto, ListOptionsQuery, UpdateOptionDto } from './options.dto';
import { Permission } from '../common/decorators';
import { validated } from '../common/validation.pipe';

/** Managed lists of employee designations and project roles. */
@Controller('options')
@Dependencies(OptionsService)
export class OptionsController {
  constructor(options) {
    this.options = options;
  }

  @Get()
  @Permission('options:read')
  @Bind(Query(validated(ListOptionsQuery)))
  list(query) {
    return this.options.list(query);
  }

  @Post()
  @Permission('options:write')
  @Bind(Body(validated(CreateOptionDto)))
  create(dto) {
    return this.options.create(dto);
  }

  @Patch(':id')
  @Permission('options:write')
  @Bind(Param('id', ParseUUIDPipe), Body(validated(UpdateOptionDto)))
  update(id, dto) {
    return this.options.update(id, dto);
  }

  @Delete(':id')
  @Permission('options:write')
  @HttpCode(204)
  @Bind(Param('id', ParseUUIDPipe))
  remove(id) {
    return this.options.remove(id);
  }
}
