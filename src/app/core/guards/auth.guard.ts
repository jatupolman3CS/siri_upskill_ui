import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';

/**
 * Functional route guard for any route that requires a signed-in caller.
 * In bypass mode (or when authenticated), allows access immediately to explore all menus and roles!
 * Everyone else is sent to /login with `returnUrl` set to the page they asked for, so signing in
 * (password or Google) brings them back to it.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);

  if (authService.isAuthenticated() || authService.isBypassActive()) {
    return true;
  }

  const returnUrl = state?.url;

  return inject(Router).createUrlTree(['/login'], returnUrl ? { queryParams: { returnUrl } } : {});
};
