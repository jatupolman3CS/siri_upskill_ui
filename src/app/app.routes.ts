import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { instructorStudioGuard } from './core/guards/instructor-studio.guard';
import { roleGuard } from './core/guards/role.guard';
import { loadLearnerTutoringDictionary, loadPublicTutoringDictionary } from './features/tutoring/i18n/tutoring-dictionaries';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/home/home-page/home-page').then((m) => m.HomePage),
      },
      // Catalog (P1-21) — public course listing + filter, the destination every category link
      // (P1-20's mega menu / mobile drawer) points at.
      {
        path: 'courses',
        loadComponent: () =>
          import('./features/catalog/courses-page/courses-page').then((m) => m.CoursesPage),
      },
      // Course detail (P1-22) — the destination every course card on `/courses` links to.
      // `:slug` must be registered as its own path segment distinct from the literal `courses` above;
      // Angular Router matches array entries in order but these two patterns never collide (one has no
      // trailing segment, the other requires one), so declaration order between them doesn't matter.
      {
        path: 'courses/:slug',
        loadComponent: () =>
          import('./features/catalog/course-detail-page/course-detail-page').then((m) => m.CourseDetailPage),
      },
      {
        path: 'learning-paths',
        loadComponent: () =>
          import('./features/catalog/learning-paths-page/learning-paths-page').then((m) => m.LearningPathsPage),
      },
      {
        path: 'learning-paths/:slug',
        loadComponent: () =>
          import('./features/catalog/learning-path-detail-page/learning-path-detail-page').then((m) => m.LearningPathDetailPage),
      },
      // Tutor marketplace (P13-20/21) — public search and profile, server-rendered and indexable. The profile's "Book"
      // action only appears because the router declares `tutors/:slug/book` (see tutor-booking-link.ts).
      // The marketplace texts (`tutoring.*`) are not in the base dictionaries: each audience's resolver loads its own lazy pair
      // before the page renders - on the server too for these two public routes (see features/tutoring/i18n/tutoring-dictionaries.ts).
      {
        path: 'tutors',
        resolve: { dictionary: loadPublicTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/public/tutors-page/tutors-page').then((m) => m.TutorsPage),
      },
      // Booking (P13-22) — signed-in only and client-rendered (see app.routes.server.ts); the query string is only a
      // pre-selection, every value is re-validated and re-priced by the server.
      {
        path: 'tutors/:slug/book',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/booking-page/booking-page').then((m) => m.BookingPage),
      },
      // Buying a package of lessons (P13-22b) — choose who it is for, then pay at /tutoring/checkout/package/:purchaseId.
      // Signed-in only and client-rendered: it has its own exact entry in app.routes.server.ts, in this same change.
      {
        path: 'tutors/:slug/packages/:packageId',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/package-purchase-page/package-purchase-page').then((m) => m.PackagePurchasePage),
      },
      {
        path: 'tutors/:slug',
        resolve: { dictionary: loadPublicTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/public/tutor-profile-page/tutor-profile-page').then((m) => m.TutorProfilePage),
      },
      // Tutoring checkout (P13-22) — pay for a held lesson (PromptPay QR / card) or see how it ended. Covered by the
      // `tutoring/**` client-render entry in app.routes.server.ts.
      {
        path: 'tutoring/checkout/:bookingId',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/checkout-page/tutoring-checkout-page').then((m) => m.TutoringCheckoutPage),
      },
      // Paying for a package purchase (P13-22b) — the same page as the booking checkout, told by `data` what it is paying for.
      {
        path: 'tutoring/checkout/package/:purchaseId',
        canActivate: [authGuard],
        data: { checkoutKind: 'Package' },
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/checkout-page/tutoring-checkout-page').then((m) => m.TutoringCheckoutPage),
      },
      // Tutoring join (P13-23) — the hand-off to the Meet room of a class, for the learner and for the tutor. Every link in the
      // e-mails and calendar invites points here. Covered by the `tutoring/**` client-render entry in app.routes.server.ts.
      {
        path: 'tutoring/sessions/:sessionId/join',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/join-page/tutoring-join-page').then((m) => m.TutoringJoinPage),
      },
      // "My tutoring" (P13-23) — the learner's lessons, one lesson in full, and one problem report. Signed-in only and
      // client-rendered (`my-tutoring` and `my-tutoring/**` in app.routes.server.ts).
      {
        path: 'my-tutoring',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/my-tutoring/my-tutoring-page/my-tutoring-page').then((m) => m.MyTutoringPage),
      },
      // The learner's packages (P13-22b): the list, and one purchase with its credits and the calendar to spend one.
      {
        path: 'my-tutoring/packages',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/my-tutoring/my-packages-page/my-packages-page').then((m) => m.MyPackagesPage),
      },
      {
        path: 'my-tutoring/packages/:purchaseId',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/my-tutoring/package-detail-page/package-detail-page').then((m) => m.PackageDetailPage),
      },
      {
        path: 'my-tutoring/bookings/:bookingId',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/my-tutoring/booking-detail-page/booking-detail-page').then((m) => m.BookingDetailPage),
      },
      {
        path: 'my-tutoring/disputes/:disputeId',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/my-tutoring/dispute-page/dispute-page').then((m) => m.DisputePage),
      },
      {
        path: 'wishlist',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/catalog/wishlist-page/wishlist-page').then((m) => m.WishlistPage),
      },
      // Auth pages (P0-35) — unauthenticated flows against the real Identity API. See
      // app.routes.server.ts for each route's SSR/CSR rendering decision and why. /register, /login and
      // /forgot-password are guests-only (guestGuard): someone already signed in is sent to /.
      {
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/register/register-page').then((m) => m.RegisterPage),
      },
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/login/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'confirm-email',
        loadComponent: () =>
          import('./features/auth/confirm-email/confirm-email-page').then((m) => m.ConfirmEmailPage),
      },
      {
        path: 'forgot-password',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password-page').then((m) => m.ForgotPasswordPage),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password-page').then((m) => m.ResetPasswordPage),
      },
      // Legal & Information pages (P7-09)
      {
        path: 'terms',
        loadComponent: () =>
          import('./features/legal/terms-page/terms-page').then((m) => m.TermsPage),
      },
      {
        path: 'privacy',
        loadComponent: () =>
          import('./features/legal/privacy-page/privacy-page').then((m) => m.PrivacyPage),
      },
      {
        path: 'refund-policy',
        loadComponent: () =>
          import('./features/legal/refund-policy-page/refund-policy-page').then((m) => m.RefundPolicyPage),
      },
      {
        path: 'faq',
        loadComponent: () =>
          import('./features/legal/faq-page/faq-page').then((m) => m.FaqPage),
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./features/legal/contact-page/contact-page').then((m) => m.ContactPage),
      },
      // Authenticated (authGuard)
      {
        path: 'account/devices',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/auth/devices/devices-page').then((m) => m.DevicesPage),
      },
      {
        path: 'account/privacy',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/auth/account-privacy/account-privacy-page').then((m) => m.AccountPrivacyPage),
      },
      // Learner profiles (P13-22) — the nicknames and school grades an account books tutoring lessons for.
      {
        path: 'account/learner-profiles',
        canActivate: [authGuard],
        resolve: { dictionary: loadLearnerTutoringDictionary },
        loadComponent: () =>
          import('./features/tutoring/learner/learner-profiles-page/learner-profiles-page').then((m) => m.LearnerProfilesPage),
      },
      // Instructor application (any signed-in user) — the one instructor page an unapproved user may see: apply,
      // wait for the admin's review, or re-apply after a rejection. The same wizard also lives at
      // /instructor/onboarding, but that route sits behind instructorStudioGuard — closed to the very people who apply.
      {
        path: 'become-instructor',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/instructor/onboarding/instructor-onboarding-page').then((m) => m.InstructorOnboardingPage),
      },
      // Cart (P3-20) — Cart page with local storage persistence
      {
        path: 'cart',
        loadComponent: () =>
          import('./features/commerce/cart/cart-page.component').then((m) => m.CartPageComponent),
      },
      // Checkout (P3-21) — Authenticated checkout & PromptPay QR page
      {
        path: 'checkout',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/commerce/checkout-page/checkout-page').then((m) => m.CheckoutPage),
      },
      {
        path: 'checkout/success',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/commerce/order-success-page/order-success-page').then((m) => m.OrderSuccessPage),
      },
      {
        path: 'checkout/success/:orderId',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/commerce/order-success-page/order-success-page').then((m) => m.OrderSuccessPage),
      },
      {
        path: 'checkout/:orderId',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/commerce/checkout-page/checkout-page').then((m) => m.CheckoutPage),
      },
      // Order History (P3-23) — Authenticated order history, receipts, and refund requests
      {
        path: 'account/orders',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/commerce/order-history-page/order-history-page').then((m) => m.OrderHistoryPage),
      },
      {
        path: 'orders',
        redirectTo: 'account/orders',
        pathMatch: 'full',
      },
      // My Courses (P3-24) — Authenticated enrolled courses dashboard
      {
        path: 'my-courses',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/learning/my-courses-page/my-courses-page').then((m) => m.MyCoursesPage),
      },
      // Live room hand-off (P11) — the server-gated join; CSR + noindex (see app.routes.server.ts). The join call
      // itself is made once from the page's afterNextRender(), never from a resolver, so a prefetch cannot trigger it.
      {
        path: 'live/:sessionId/join',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/live/learner/live-join-page/live-join-page').then((m) => m.LiveJoinPage),
      },
      // Certificate Verification (P5-22) — Public credential verification
      {
        path: 'certificates/verify',
        loadComponent: () =>
          import('./features/learning/certificate-verify-page/certificate-verify-page').then((m) => m.CertificateVerifyPage),
      },
      {
        path: 'certificates/verify/:code',
        loadComponent: () =>
          import('./features/learning/certificate-verify-page/certificate-verify-page').then((m) => m.CertificateVerifyPage),
      },
      // Public Blog & Knowledge Hub (P6-24)
      {
        path: 'blog',
        loadComponent: () =>
          import('./features/blog/blog-list-page/blog-list-page').then((m) => m.BlogListPage),
      },
      {
        path: 'blog/:slug',
        loadComponent: () =>
          import('./features/blog/blog-detail-page/blog-detail-page').then((m) => m.BlogDetailPage),
      },
    ],
  },
  // Public classroom shell; the API authorizes each episode (free preview or enrollment).
  {
    path: 'learn',
    loadComponent: () =>
      import('./layouts/learn-layout/learn-layout').then((m) => m.LearnLayout),
    children: [
      {
        path: ':slug',
        loadComponent: () =>
          import('./features/learning/learn-page/learn-page').then((m) => m.LearnPage),
      },
      {
        path: ':slug/:episodeId',
        loadComponent: () =>
          import('./features/learning/learn-page/learn-page').then((m) => m.LearnPage),
      },
    ],
  },
  // Instructor Studio (P4-20 .. P4-24) — CSR + authGuard + instructorStudioGuard. Anyone whose application an
  // admin has not approved is sent to /become-instructor (the only instructor page they may see); admins pass.
  {
    path: 'instructor',
    canActivate: [authGuard, instructorStudioGuard],
    loadComponent: () =>
      import('./layouts/instructor-layout/instructor-layout').then((m) => m.InstructorLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/instructor/dashboard/instructor-dashboard-page').then((m) => m.InstructorDashboardPage),
      },
      {
        path: 'courses',
        loadComponent: () =>
          import('./features/instructor/dashboard/instructor-dashboard-page').then((m) => m.InstructorDashboardPage),
      },
      {
        path: 'courses/new',
        loadComponent: () =>
          import('./features/instructor/course-builder/course-builder-page').then((m) => m.CourseBuilderPage),
      },
      {
        path: 'courses/:id/builder',
        loadComponent: () =>
          import('./features/instructor/course-builder/course-builder-page').then((m) => m.CourseBuilderPage),
      },
      {
        path: 'announcements',
        loadComponent: () =>
          import('./features/instructor/announcements/instructor-announcements-page').then((m) => m.InstructorAnnouncementsPage),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/instructor/analytics/instructor-analytics-page').then((m) => m.InstructorAnalyticsPage),
      },
      {
        path: 'earnings',
        loadComponent: () =>
          import('./features/instructor/earnings/instructor-earnings-page').then((m) => m.InstructorEarningsPage),
      },
      {
        path: 'onboarding',
        loadComponent: () =>
          import('./features/instructor/onboarding/instructor-onboarding-page').then((m) => m.InstructorOnboardingPage),
      },
      // Live teaching (P11) — Google Calendar connection + live-session management.
      {
        path: 'live-settings',
        loadComponent: () =>
          import('./features/live/instructor/live-settings-page/live-settings-page').then((m) => m.LiveSettingsPage),
      },
      {
        path: 'sessions',
        loadComponent: () =>
          import('./features/live/instructor/sessions-page/sessions-page').then((m) => m.SessionsPage),
      },
      {
        path: 'sessions/:id',
        loadComponent: () =>
          import('./features/live/instructor/session-detail-page/session-detail-page').then((m) => m.SessionDetailPage),
      },
      // Tutor Portal (P13-24) — onboarding hub, profile, offerings, credentials and identity verification. All reachable
      // before the tutor is verified; screens that need `Verified` (P13-25) will sit behind `verifiedTutorGuard`.
      {
        path: 'tutoring',
        loadChildren: () => import('./features/tutoring/tutor/tutor.routes').then((m) => m.TUTOR_ROUTES),
      },
    ],
  },
  // Admin CMS & Ops (P6-20 .. P6-23) — CSR + authGuard + roleGuard
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['Admin', 'SuperAdmin'] },
    loadComponent: () =>
      import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/admin/dashboard/admin-dashboard-page').then((m) => m.AdminDashboardPage),
      },
      {
        path: 'courses',
        loadComponent: () =>
          import('./features/admin/course-moderation/admin-course-moderation-page').then((m) => m.AdminCourseModerationPage),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/admin/categories/admin-categories-page').then((m) => m.AdminCategoriesPage),
      },
      {
        path: 'instructors',
        loadComponent: () =>
          import('./features/admin/instructors/admin-instructors-page').then((m) => m.AdminInstructorsPage),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/users/admin-users-page').then((m) => m.AdminUsersPage),
      },
      {
        path: 'marketing',
        loadComponent: () =>
          import('./features/admin/marketing/admin-marketing-page').then((m) => m.AdminMarketingPage),
      },
      {
        path: 'banners',
        loadComponent: () =>
          import('./features/admin/banners/admin-banners-page').then((m) => m.AdminBannersPage),
      },
      {
        path: 'menus',
        loadComponent: () =>
          import('./features/admin/menus/admin-menus-page').then((m) => m.AdminMenusPage),
      },
      {
        path: 'posts',
        loadComponent: () =>
          import('./features/admin/posts/admin-posts-page').then((m) => m.AdminPostsPage),
      },
      {
        path: 'payouts',
        loadComponent: () =>
          import('./features/admin/payouts/admin-payouts-page').then((m) => m.AdminPayoutsPage),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./features/admin/payments/admin-payments-page').then((m) => m.AdminPaymentsPage),
      },
      {
        path: 'payment-settings',
        loadComponent: () =>
          import('./features/admin/payment-settings/admin-payment-settings-page').then((m) => m.AdminPaymentSettingsPage),
      },
      {
        path: 'contact-messages',
        loadComponent: () =>
          import('./features/admin/contact-messages/admin-contact-messages-page').then((m) => m.AdminContactMessagesPage),
      },
      {
        path: 'live-status',
        loadComponent: () =>
          import('./features/admin/live-status/admin-live-status-page').then((m) => m.AdminLiveStatusPage),
      },
      // Tutor marketplace administration (P13-26): identity checks, tutors + subjects, disputes. Same authGuard + roleGuard as the rest.
      {
        path: 'tutoring',
        loadChildren: () => import('./features/tutoring/admin/admin-tutoring.routes').then((m) => m.ADMIN_TUTORING_ROUTES),
      },
    ],
  },
  // Catch-all wildcard route
  {
    path: '**',
    redirectTo: '',
  },
];
