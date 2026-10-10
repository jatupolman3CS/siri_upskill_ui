import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';

import { InstructorProfileApiService } from '../../features/instructor/data/instructor-profile-api.service';
import { AuthService } from '../auth/auth.service';

/**
 * Gate for the whole `/instructor` studio. Until an admin has approved the caller's instructor application
 * the only instructor-facing page they may see is the application page (`/become-instructor`: apply form,
 * "waiting for review", or "rejected — apply again"), so every refusal below redirects there rather than to `/`.
 *
 * The decision is the server's, not the token's: the `Instructor` role in the access token is a hint that can
 * exist without an approved profile (an admin assigning the role by hand, an invite, a seed), so for everyone
 * but admins this asks `GET /api/catalog/instructors/me` and lets the caller through only on `Approved`.
 * Admin / SuperAdmin keep their support access to the studio (the API's `InstructorOnly` policy allows them too)
 * and are not applicants, so they skip the lookup.
 *
 * Fails closed: a failed lookup (404 = never applied, 5xx, offline) sends the caller to the application page,
 * which has its own retry state — an unverifiable approval is never treated as an approval.
 */
export const instructorStudioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const profileApi = inject(InstructorProfileApiService);
  const applicationPage = inject(Router).createUrlTree(['/become-instructor']);

  const roles = auth.currentUser()?.roles ?? [];
  if (roles.includes('Admin') || roles.includes('SuperAdmin')) {
    return true;
  }

  return profileApi.getMyProfile().pipe(
    switchMap((profile) => {
      if (profile.status !== 'Approved') {
        return of(applicationPage);
      }
      if (roles.includes('Instructor')) {
        return of(true);
      }
      // Approved after this access token was issued: the role only reaches the token on the next refresh, so
      // pick it up now instead of bouncing a freshly approved instructor off the studio for up to 15 minutes.
      return auth.refreshToken().pipe(map(() => (auth.hasRole('Instructor') ? true : applicationPage)));
    }),
    catchError(() => of(applicationPage)),
  );
};
