import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

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
      // Auth pages (P0-35) — unauthenticated flows against the real Identity API. See
      // app.routes.server.ts for each route's SSR/CSR rendering decision and why.
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register-page').then((m) => m.RegisterPage),
      },
      {
        path: 'login',
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
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password-page').then((m) => m.ForgotPasswordPage),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password-page').then((m) => m.ResetPasswordPage),
      },
      // Authenticated (authGuard)
      {
        path: 'account/devices',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/auth/devices/devices-page').then((m) => m.DevicesPage),
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
      // My Courses (P3-24) — Authenticated enrolled courses dashboard
      {
        path: 'my-courses',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/learning/my-courses-page/my-courses-page').then((m) => m.MyCoursesPage),
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
  // Learn / Classroom (P2-24) — CSR + authGuard
  {
    path: 'learn',
    canActivate: [authGuard],
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
  // Instructor Studio (P4-20 .. P4-24) — CSR + authGuard
  {
    path: 'instructor',
    canActivate: [authGuard],
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
    ],
  },
  // Admin CMS & Ops (P6-20 .. P6-23) — CSR + authGuard
  {
    path: 'admin',
    canActivate: [authGuard],
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
        path: 'posts',
        loadComponent: () =>
          import('./features/admin/posts/admin-posts-page').then((m) => m.AdminPostsPage),
      },
      {
        path: 'payouts',
        loadComponent: () =>
          import('./features/admin/payouts/admin-payouts-page').then((m) => m.AdminPayoutsPage),
      },
    ],
  },
];
