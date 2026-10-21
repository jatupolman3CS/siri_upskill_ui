import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from '../../../app.routes';
import { authGuard } from '../../../core/guards/auth.guard';
import { roleGuard } from '../../../core/guards/role.guard';
import { ADMIN_NAV_LINKS } from '../../../layouts/admin-layout/admin-nav';
import { HTTP_TEST_PROVIDERS } from './testing/spec-helpers';
import { ADMIN_TUTORING_PAGE_ROUTES, ADMIN_TUTORING_ROUTES } from './admin-tutoring.routes';
import { TranslationService } from '../../../core/i18n/translation.service';

describe('ADMIN_TUTORING_ROUTES', () => {
  const paths = ADMIN_TUTORING_PAGE_ROUTES.map((route) => route.path);

  it('declares every page: kyc, tutors, subjects, disputes, analytics and reviews, each with its detail route where there is one', () => {
    expect(paths).toEqual(['', 'kyc', 'kyc/:caseId', 'tutors', 'tutors/:tutorId', 'subjects', 'disputes', 'disputes/:disputeId', 'analytics', 'reviews']);
  });

  it('lazy-loads every page', () => {
    for (const route of ADMIN_TUTORING_PAGE_ROUTES.filter((entry) => entry.path !== '')) {
      expect(route.loadComponent, route.path).toBeTypeOf('function');
      expect(route.component, route.path).toBeUndefined();
    }
  });

  it('lands the bare /admin/tutoring on the identity-check queue', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'admin/tutoring', children: ADMIN_TUTORING_ROUTES }]), ...HTTP_TEST_PROVIDERS] });
    const httpMock = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/tutoring');
    expect(TestBed.inject(Router).url).toBe('/admin/tutoring/kyc');
    httpMock.expectOne((request) => request.url === '/api/tutoring/admin/kyc/cases').flush({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
    httpMock.verify();
  });

  it('loads the texts of the area before any page renders, so no page ever shows a raw key', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'admin/tutoring', children: ADMIN_TUTORING_ROUTES }]), ...HTTP_TEST_PROVIDERS] });
    const translation = TestBed.inject(TranslationService);
    const httpMock = TestBed.inject(HttpTestingController);
    expect(translation.t('tutoring.admin.kyc.heading')).toBe('tutoring.admin.kyc.heading');

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/tutoring/tutors');
    httpMock.expectOne((request) => request.url === '/api/tutoring/admin/tutors').flush({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
    translation.setLocale('en');
    expect(translation.t('tutoring.admin.kyc.heading')).toBe('Tutor identity checks');
    translation.setLocale('th');
    expect(translation.t('tutoring.admin.kyc.heading')).not.toBe('tutoring.admin.kyc.heading');
  });

  it('resolves each page component without error', async () => {
    for (const route of ADMIN_TUTORING_PAGE_ROUTES.filter((entry) => entry.path !== '')) {
      const loaded = await (route.loadComponent as () => Promise<unknown>)();
      expect(loaded, route.path).toBeTruthy();
    }
  });

  it('is mounted under the admin shell, so it sits behind the same authGuard + roleGuard (Admin / SuperAdmin) with no guard of its own', async () => {
    const admin = routes.find((route) => route.path === 'admin');
    const child = admin?.children?.find((route) => route.path === 'tutoring');
    expect(admin?.canActivate).toEqual([authGuard, roleGuard]);
    expect(admin?.data).toEqual({ roles: ['Admin', 'SuperAdmin'] });
    expect(child).toBeDefined();
    expect(child?.canActivate).toBeUndefined();
    expect(await (child?.loadChildren as () => Promise<unknown>)()).toBe(ADMIN_TUTORING_ROUTES);
  });

  it('is reachable from the admin sidebar: one entry per area, all under /admin/tutoring', () => {
    const tutoring = ADMIN_NAV_LINKS.filter((link) => link.route.startsWith('/admin/tutoring'));
    expect(tutoring.map((link) => link.route)).toEqual(['/admin/tutoring/kyc', '/admin/tutoring/tutors', '/admin/tutoring/disputes', '/admin/tutoring/analytics']);
    expect(tutoring.every((link) => link.labelKey.startsWith('admin.nav.tutoring'))).toBe(true);
  });
});
