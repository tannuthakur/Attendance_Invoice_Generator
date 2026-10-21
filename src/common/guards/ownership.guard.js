import { Injectable, Dependencies, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OWNED_BY_KEY } from '../decorators';

/** When the caller only has ':own' access, the targeted employee id must be their own. */
@Injectable()
@Dependencies(Reflector)
export class OwnershipGuard {
  constructor(reflector) {
    this.reflector = reflector;
  }

  canActivate(context) {
    const req = context.switchToHttp().getRequest();
    if (req.access !== 'own') return true;

    const source = this.reflector.getAllAndOverride(OWNED_BY_KEY, [context.getHandler(), context.getClass()]);
    if (!source) throw new ForbiddenException('You do not have permission to perform this action');

    const target =
      (source.param && req.params?.[source.param]) ||
      (source.query && req.query?.[source.query]) ||
      (source.body && req.body?.[source.body]);

    if (!req.user.employeeId || target !== req.user.employeeId) {
      throw new ForbiddenException('You can only access your own records');
    }
    return true;
  }
}
