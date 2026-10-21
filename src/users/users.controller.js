import { Controller, Dependencies, Get, Post, Patch, Body, Param, Query, Bind, ParseUUIDPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateRoleDto, ListUsersQuery } from './users.dto';
import { Permission, CurrentUser } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('users')
@Dependencies(UsersService)
export class UsersController {
  constructor(users) {
    this.users = users;
  }

  @Get()
  @Permission('users:read')
  @Bind(Query(validated(ListUsersQuery)))
  list(query) {
    return this.users.list(query);
  }

  @Post()
  @Permission('users:write')
  @Bind(Body(validated(CreateUserDto)))
  create(dto) {
    return this.users.create(dto);
  }

  @Patch(':id/role')
  @Permission('users:write')
  @Bind(Param('id', ParseUUIDPipe), Body(validated(UpdateRoleDto)), CurrentUser())
  updateRole(id, dto, user) {
    return this.users.updateRole(id, dto.role, user);
  }
}
