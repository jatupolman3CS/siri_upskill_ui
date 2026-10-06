import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';

/**
 * Functional route guard for routes restricted to specific user roles.
 * Expects allowed roles configured in route data: { roles: ['Admin', 'SuperAdmin'] }.
 *
 * Reads roles directly from AuthService.currentUser()?.roles, which handles both
 * real JWT authentication and dev bypass/mock mode seamlessly.
 *
 * If the authenticated user does not have an allowed role, redirects to '/'.
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const allowedRoles = (route.data?.['roles'] as readonly string[] | string[] | undefined) ?? [];
  const userRoles = authService.currentUser()?.roles ?? [];

  const hasAccess = allowedRoles.length === 0 || allowedRoles.some((role) => userRoles.includes(role));
  if (hasAccess) {
    return true;
  }

  return router.createUrlTree(['/']);
};
