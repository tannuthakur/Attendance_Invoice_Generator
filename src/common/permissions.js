/**
 * Role → allowed actions. '*' grants everything.
 * An action suffixed with ':own' grants it only for the caller's own employee record;
 * the OwnershipGuard enforces that. E.g. to let users mark their own attendance later,
 * add 'attendance:write:own' here and decorate the route with @OwnedBy({ body: 'employeeId' }).
 */
export const PERMISSIONS = {
  admin: ['*'],
  user: ['profile:read', 'employees:read:own'],
};

/** @returns {'all' | 'own' | null} */
export function resolveAccess(role, action) {
  const granted = PERMISSIONS[role] || [];
  if (granted.includes('*') || granted.includes(action)) return 'all';
  if (granted.includes(`${action}:own`)) return 'own';
  return null;
}
