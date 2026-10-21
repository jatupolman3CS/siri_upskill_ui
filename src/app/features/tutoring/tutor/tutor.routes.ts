import { Routes } from '@angular/router';

import { verifiedTutorGuard } from '../../../core/guards/verified-tutor.guard';
import { loadTutorTutoringDictionary } from '../i18n/tutoring-dictionaries';

/**
 * Tutor Portal routes (P13-24, P13-25), mounted at `/instructor/tutoring` inside the instructor studio (which already requires an
 * approved instructor - `instructorStudioGuard`).
 *
 * Reachable BEFORE the tutor is verified: the onboarding hub, profile, offerings, credentials and identity verification - becoming
 * verifiable is what they are for. Behind `verifiedTutorGuard`: availability and packages - the API's `TutorOnly` policy is the real
 * gate, the guard only spares a tutor a screen whose every call would answer 403.
 *
 * Deliberately NOT behind the guard (the server leaves them open to an approved instructor even if the tutor is suspended):
 * the wallet - a suspended tutor must still see the money owed to them; the class list (`GET tutor/classes` is `InstructorOnly`,
 * so a suspended tutor sees the classes still pending and the `canStart` / `canComplete` flags already come back `false` for
 * them); and a single class page, which is where a tutor cancels (`classes/:sessionId`, also the address the invitation and
 * reminder e-mails point to). The class page copes with the verified-only calls refusing and keeps the cancel action working.
 * Everything here already sits behind the approved-instructor check of the studio (`instructorStudioGuard`).
 *
 * `/instructor/**` is client-rendered only (`app.routes.server.ts`), so no server-route entry is needed for these.
 *
 * The portal's texts (`tutoring.tutor.*`, `tutoring.kyc.*`, and the texts every tutoring audience shares) are not in the base dictionaries:
 * the resolver on the wrapping route loads them (see `../i18n/tutoring-dictionaries.ts`) before any of the pages renders.
 */
export const TUTOR_PAGE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./onboarding-page/tutor-onboarding-page').then((m) => m.TutorOnboardingPage),
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile-page/tutor-profile-editor-page').then((m) => m.TutorProfileEditorPage),
  },
  {
    path: 'offerings',
    loadComponent: () => import('./offerings-page/tutor-offerings-page').then((m) => m.TutorOfferingsPage),
  },
  {
    path: 'credentials',
    loadComponent: () => import('./credentials-page/tutor-credentials-page').then((m) => m.TutorCredentialsPage),
  },
  {
    path: 'kyc',
    loadComponent: () => import('./kyc-page/tutor-kyc-page').then((m) => m.TutorKycPage),
  },
  {
    path: 'availability',
    canActivate: [verifiedTutorGuard],
    loadComponent: () => import('./availability-page/tutor-availability-page').then((m) => m.TutorAvailabilityPage),
  },
  {
    path: 'classes',
    loadComponent: () => import('./classes-page/tutor-classes-page').then((m) => m.TutorClassesPage),
  },
  {
    path: 'classes/:sessionId',
    loadComponent: () => import('./class-page/tutor-class-page').then((m) => m.TutorClassPage),
  },
  {
    path: 'packages',
    canActivate: [verifiedTutorGuard],
    loadComponent: () => import('./packages-page/tutor-packages-page').then((m) => m.TutorPackagesPage),
  },
  {
    path: 'wallet',
    loadComponent: () => import('./wallet-page/tutor-wallet-page').then((m) => m.TutorWalletPage),
  },
  {
    path: 'disputes',
    loadComponent: () => import('./disputes-page/tutor-disputes-page').then((m) => m.TutorDisputesPage),
  },
  {
    path: 'disputes/:disputeId',
    loadComponent: () => import('./dispute-detail-page/tutor-dispute-detail-page').then((m) => m.TutorDisputeDetailPage),
  },
];

export const TUTOR_ROUTES: Routes = [
  {
    path: '',
    resolve: { dictionary: loadTutorTutoringDictionary },
    children: TUTOR_PAGE_ROUTES,
  },
];
