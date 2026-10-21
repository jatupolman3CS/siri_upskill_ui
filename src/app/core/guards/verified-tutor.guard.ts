import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { TutoringTutorApiService } from '../../features/tutoring/data/tutoring-tutor-api.service';

/** Where a tutor who is not verified (yet) is sent, with the reason the onboarding hub explains. */
export const TUTOR_ONBOARDING_ROUTE = '/instructor/tutoring';
export const VERIFICATION_REQUIRED_QUERY = { required: 'verified' } as const;

/**
 * Convenience gate for the Tutor Portal screens that only make sense for a verified tutor (availability, classes, packages -
 * their API sits behind the server's `TutorOnly` policy). It sends everyone else to the onboarding hub, which explains what
 * is missing, instead of letting them open a screen whose every call would answer 403.
 *
 * It is a courtesy, not the control: the decision is the server's (`GET /api/tutoring/tutor/profile` -> `status`), and the API
 * enforces `TutorOnly` regardless of what this guard did. It fails closed - a failed lookup (no profile yet, 5xx, offline) is
 * treated as "not verified", never as a pass. Sits behind `instructorStudioGuard`, so only approved instructors get this far.
 * Onboarding, profile, offerings, credentials and verification screens are NOT behind it: they must work before verification.
 */
export const verifiedTutorGuard: CanActivateFn = () => {
  const api = inject(TutoringTutorApiService);
  const onboarding = inject(Router).createUrlTree([TUTOR_ONBOARDING_ROUTE], { queryParams: VERIFICATION_REQUIRED_QUERY });

  return api.getProfile().pipe(
    map((profile) => (profile.status === 'Verified' ? true : onboarding)),
    catchError(() => of(onboarding)),
  );
};
