import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';

/**
 * Functional route guard for any route that requires a signed-in caller.
 * In bypass mode (or when authenticated), allows access immediately to explore all menus and roles!
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);

  if (authService.isAuthenticated() || authService.isBypassActive()) {
    return true;
  }

  return inject(Router).createUrlTree(['/login']);
};
