import { Controller, Dependencies, Get, Post, Patch, Delete, Body, Param, Query, Bind, ParseUUIDPipe } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { APP_CONFIG } from '../common/tokens';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdateStatusDto, ListEmployeesQuery } from './employees.dto';
import { Permission, OwnedBy } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('employees')
@Dependencies(EmployeesService, SupabaseService, APP_CONFIG)
export class EmployeesController {
  constructor(employees, supabase, config) {
    this.employees = employees;
    this.supabase = supabase;
    this.config = config;
  }

  @Get('facets')
  @Permission('employees:list')
  facets() {
    return this.employees.facets();
  }

  @Get()
  @Permission('employees:list')
  @Bind(Query(validated(ListEmployeesQuery)))
  list(query) {
    return this.employees.list(query);
  }

  @Get(':id')
  @Permission('employees:read')
  @OwnedBy({ param: 'id' })
  @Bind(Param('id', ParseUUIDPipe))
  findOne(id) {
    return this.employees.findOne(id);
  }

  @Post()
  @Permission('employees:write')
  @Bind(Body(validated(CreateEmployeeDto)))
  create(dto) {
    return this.employees.create(dto);
  }

  @Patch(':id')
  @Permission('employees:write')
  @Bind(Param('id', ParseUUIDPipe), Body(validated(UpdateEmployeeDto)))
  update(id, dto) {
    return this.employees.update(id, dto);
  }

  @Patch(':id/status')
  @Permission('employees:write')
  @Bind(Param('id', ParseUUIDPipe), Body(validated(UpdateStatusDto)))
  updateStatus(id, dto) {
    return this.employees.updateStatus(id, dto);
  }

  @Get(':id/usage')
  @Permission('employees:delete')
  @Bind(Param('id', ParseUUIDPipe))
  usage(id) {
    return this.employees.usage(id);
  }

  @Delete(':id')
  @Permission('employees:delete')
  @Bind(Param('id', ParseUUIDPipe))
  remove(id) {
    return this.employees.remove(id, this.supabase.admin.storage, this.config.invoices.bucket);
  }
}
