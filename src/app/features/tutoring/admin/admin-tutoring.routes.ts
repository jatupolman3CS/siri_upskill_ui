import { Routes } from '@angular/router';

import { loadAdminTutoringDictionary } from './i18n/admin-tutoring-dictionary';

/**
 * Administrator tutoring routes (P13-26), mounted at `/admin/tutoring` inside the admin shell, which already sits behind `authGuard`
 * + `roleGuard` (Admin / SuperAdmin) - the API's `AdminOnly` policy is the real gate. `/admin/**` is client-rendered only
 * (`app.routes.server.ts`), so no server-route entry is needed for these.
 *
 * `kyc`: the identity-check queue and one case (documents are opened in-page from there). `tutors`: the tutor list, one tutor
 * and, beside it, the subject catalogue. `disputes`: the queue and one dispute. `analytics` (P13-27): the marketplace's numbers. The bare `/admin/tutoring` lands on the KYC queue,
 * the first thing an administrator has to work through.
 *
 * The area's texts (`tutoring.admin.*`) are not in the base dictionaries: the resolver on the wrapping route loads them (see
 * `i18n/admin-tutoring-dictionary.ts`) before any of the pages renders.
 */
export const ADMIN_TUTORING_PAGE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'kyc' },
  {
    path: 'kyc',
    loadComponent: () => import('./kyc/admin-kyc-queue-page').then((m) => m.AdminKycQueuePage),
  },
  {
    path: 'kyc/:caseId',
    loadComponent: () => import('./kyc/admin-kyc-case-page').then((m) => m.AdminKycCasePage),
  },
  {
    path: 'tutors',
    loadComponent: () => import('./tutors/admin-tutors-page').then((m) => m.AdminTutorsPage),
  },
  {
    path: 'tutors/:tutorId',
    loadComponent: () => import('./tutors/admin-tutor-page').then((m) => m.AdminTutorPage),
  },
  {
    path: 'subjects',
    loadComponent: () => import('./tutors/subjects/admin-subjects-page').then((m) => m.AdminSubjectsPage),
  },
  {
    path: 'disputes',
    loadComponent: () => import('./disputes/admin-disputes-page').then((m) => m.AdminDisputesPage),
  },
  {
    path: 'disputes/:disputeId',
    loadComponent: () => import('./disputes/admin-dispute-page').then((m) => m.AdminDisputePage),
  },
  {
    path: 'analytics',
    loadComponent: () => import('./analytics/admin-analytics-page').then((m) => m.AdminAnalyticsPage),
  },
  {
    path: 'reviews',
    loadComponent: () => import('./reviews/admin-reviews-page').then((m) => m.AdminReviewsPage),
  },
];

export const ADMIN_TUTORING_ROUTES: Routes = [
  {
    path: '',
    resolve: { dictionary: loadAdminTutoringDictionary },
    children: ADMIN_TUTORING_PAGE_ROUTES,
  },
];
