import { Controller, Dependencies, Get, Post, Body, Query, Bind } from '@nestjs/common';
import { SalariesService } from './salaries.service';
import { CreateSalaryDto, ListSalariesQuery } from './salaries.dto';
import { Permission, OwnedBy, CurrentUser } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('salaries')
@Dependencies(SalariesService)
export class SalariesController {
  constructor(salaries) {
    this.salaries = salaries;
  }

  @Post()
  @Permission('salaries:write')
  @Bind(Body(validated(CreateSalaryDto)), CurrentUser())
  create(dto, user) {
    return this.salaries.create(dto, user);
  }

  @Get()
  @Permission('salaries:read')
  @OwnedBy({ query: 'employeeId' })
  @Bind(Query(validated(ListSalariesQuery)))
  list(query) {
    return this.salaries.list(query);
  }
}
