import { Injectable, Dependencies, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators';
import { resolveAccess } from '../permissions';

/** Checks the route's @Permission() against the PERMISSIONS map and records the access scope. */
@Injectable()
@Dependencies(Reflector)
export class RolesGuard {
  constructor(reflector) {
    this.reflector = reflector;
  }

  canActivate(context) {
    const action = this.reflector.getAllAndOverride(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!action) return true;

    const req = context.switchToHttp().getRequest();
    const access = req.user && resolveAccess(req.user.role, action);
    if (!access) throw new ForbiddenException('You do not have permission to perform this action');
    req.access = access;
    return true;
  }
}
