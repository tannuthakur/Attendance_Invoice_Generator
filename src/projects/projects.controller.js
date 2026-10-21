import { Controller, Dependencies, Get, Post, Patch, Delete, Body, Param, Bind, HttpCode, ParseUUIDPipe } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { APP_CONFIG } from '../common/tokens';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto, CreateAssignmentDto, UpdateAssignmentDto, BulkAssignmentDto, ReleaseAssignmentsDto } from './projects.dto';
import { Permission } from '../common/decorators';
import { validated } from '../common/validation.pipe';

@Controller('projects')
@Dependencies(ProjectsService, SupabaseService, APP_CONFIG)
export class ProjectsController {
  constructor(projects, supabase, config) {
    this.projects = projects;
    this.supabase = supabase;
    this.config = config;
  }

  @Get()
  @Permission('projects:read')
  list() {
    return this.projects.list();
  }

  @Get(':id')
  @Permission('projects:read')
  @Bind(Param('id', ParseUUIDPipe))
  findOne(id) {
    return this.projects.findOne(id);
  }

  @Post()
  @Permission('projects:write')
  @Bind(Body(validated(CreateProjectDto)))
  create(dto) {
    return this.projects.create(dto);
  }

  @Patch(':id')
  @Permission('projects:write')
  @Bind(Param('id', ParseUUIDPipe), Body(validated(UpdateProjectDto)))
  update(id, dto) {
    return this.projects.update(id, dto);
  }

  @Get(':id/assignments')
  @Permission('projects:read')
  @Bind(Param('id', ParseUUIDPipe))
  listAssignments(id) {
    return this.projects.listAssignments(id);
  }

  @Post(':id/assignments')
  @Permission('projects:write')
  @Bind(Param('id', ParseUUIDPipe), Body(validated(CreateAssignmentDto)))
  assign(id, dto) {
    return this.projects.assign(id, dto);
  }

  @Post(':id/assignments/bulk')
  @Permission('projects:write')
  @Bind(Param('id', ParseUUIDPipe), Body(validated(BulkAssignmentDto)))
  assignMany(id, dto) {
    return this.projects.assignMany(id, dto);
  }

  @Post(':id/assignments/release')
  @Permission('projects:write')
  @HttpCode(200)
  @Bind(Param('id', ParseUUIDPipe), Body(validated(ReleaseAssignmentsDto)))
  release(id, dto) {
    return this.projects.release(id, dto);
  }

  @Delete(':id/assignments/:assignmentId')
  @Permission('projects:write')
  @HttpCode(204)
  @Bind(Param('id', ParseUUIDPipe), Param('assignmentId', ParseUUIDPipe))
  removeAssignment(id, assignmentId) {
    return this.projects.removeAssignment(id, assignmentId);
  }

  @Patch(':id/assignments/:assignmentId')
  @Permission('projects:write')
  @Bind(Param('id', ParseUUIDPipe), Param('assignmentId', ParseUUIDPipe), Body(validated(UpdateAssignmentDto)))
  updateAssignment(id, assignmentId, dto) {
    return this.projects.updateAssignment(id, assignmentId, dto);
  }

  @Get(':id/usage')
  @Permission('projects:delete')
  @Bind(Param('id', ParseUUIDPipe))
  usage(id) {
    return this.projects.usage(id);
  }

  @Delete(':id')
  @Permission('projects:delete')
  @Bind(Param('id', ParseUUIDPipe))
  remove(id) {
    return this.projects.remove(id, this.supabase.admin.storage, this.config.invoices.bucket);
  }
}
