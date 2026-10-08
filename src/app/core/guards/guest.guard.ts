import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';

/**
 * Counterpart of `authGuard` for the sign-in family of pages (`/login`, `/register`,
 * `/forgot-password`): someone who already has a session has no business there, so they are sent home
 * instead of being shown a form for an account they are already signed in to.
 * <para>
 * Server-side rendering cannot know about the session (the refresh-cookie restore runs in the browser),
 * so SSR always lets the page through; the browser re-runs this guard on its initial navigation, after
 * `AuthService.initSession()` has finished (it is an app initializer), and redirects then.
 * </para>
 */
export const guestGuard: CanActivateFn = () => {
  if (!inject(AuthService).isAuthenticated()) {
    return true;
  }
  return inject(Router).createUrlTree(['/']);
};
