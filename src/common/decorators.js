import { SetMetadata, createParamDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSION_KEY = 'permission';
export const OWNED_BY_KEY = 'ownedBy';

/** Skip JWT authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Action the caller's role must be granted in PERMISSIONS. */
export const Permission = (action) => SetMetadata(PERMISSION_KEY, action);

/**
 * Where to find the employee id when the caller only has ':own' access.
 * @param {{ param?: string, query?: string, body?: string }} source
 */
export const OwnedBy = (source) => SetMetadata(OWNED_BY_KEY, source);

/** The authenticated caller: { id, email, role, employeeId, fullName }. */
export const CurrentUser = createParamDecorator((_data, ctx) => ctx.switchToHttp().getRequest().user);
