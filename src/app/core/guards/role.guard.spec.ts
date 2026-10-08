import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, UrlTree } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../auth/auth.service';
import { buildTestAccessToken } from '../auth/testing/test-jwt';
import { accessTokenStore } from '../http/access-token.store';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  let authService: AuthService;
  let router: Router;

  const adminRoute = {
    data: { roles: ['Admin', 'SuperAdmin'] },
  } as unknown as ActivatedRouteSnapshot;

  const instructorRoute = {
    data: { roles: ['Instructor', 'Admin', 'SuperAdmin'] },
  } as unknown as ActivatedRouteSnapshot;

  function makeTestJwt(roles: string[]): string {
    return buildTestAccessToken({ userId: 'usr-test-001', roles });
  }

  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    accessTokenStore.set(null);
  });

  describe('with the roles carried by the access token', () => {
    it('redirects to / when authenticated user lacks required admin role', () => {
      accessTokenStore.set(makeTestJwt(['Learner']));

      const result = TestBed.runInInjectionContext(() => roleGuard(adminRoute, {} as never));

      expect(result).not.toBe(true);
      const expectedTree = router.createUrlTree(['/']);
      expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(expectedTree));
    });

    it('allows access when authenticated user has Admin role', () => {
      accessTokenStore.set(makeTestJwt(['Admin']));

      const result = TestBed.runInInjectionContext(() => roleGuard(adminRoute, {} as never));

      expect(result).toBe(true);
    });

    it('allows access when authenticated user has Instructor role visiting /instructor', () => {
      accessTokenStore.set(makeTestJwt(['Instructor']));

      const result = TestBed.runInInjectionContext(() => roleGuard(instructorRoute, {} as never));

      expect(result).toBe(true);
    });

    it('redirects to / when a Learner visits /instructor', () => {
      accessTokenStore.set(makeTestJwt(['Learner']));

      const result = TestBed.runInInjectionContext(() => roleGuard(instructorRoute, {} as never));

      expect(result).not.toBe(true);
      const expectedTree = router.createUrlTree(['/']);
      expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(expectedTree));
    });

    it('allows access when SuperAdmin visits /admin or /instructor', () => {
      accessTokenStore.set(makeTestJwt(['SuperAdmin']));

      expect(TestBed.runInInjectionContext(() => roleGuard(adminRoute, {} as never))).toBe(true);
      expect(TestBed.runInInjectionContext(() => roleGuard(instructorRoute, {} as never))).toBe(true);
    });

    it('redirects to / when visitor has no token', () => {
      accessTokenStore.set(null);

      const result = TestBed.runInInjectionContext(() => roleGuard(adminRoute, {} as never));

      expect(result).not.toBe(true);
      const expectedTree = router.createUrlTree(['/']);
      expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(expectedTree));
    });

    it('allows access when currentUser signal is mocked directly with allowed role', () => {
      vi.spyOn(authService, 'currentUser').mockReturnValue({
        id: 'usr-mock-999',
        roles: ['SuperAdmin', 'Admin'],
        role: 'SuperAdmin',
      });

      const result = TestBed.runInInjectionContext(() => roleGuard(adminRoute, {} as never));

      expect(result).toBe(true);
    });

    it('redirects to / when currentUser signal is mocked directly with insufficient role', () => {
      vi.spyOn(authService, 'currentUser').mockReturnValue({
        id: 'usr-mock-999',
        roles: ['Learner'],
        role: 'Learner',
      });

      const result = TestBed.runInInjectionContext(() => roleGuard(adminRoute, {} as never));

      expect(result).not.toBe(true);
      const expectedTree = router.createUrlTree(['/']);
      expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(expectedTree));
    });

    it('allows access if route specifies no roles', () => {
      accessTokenStore.set(makeTestJwt(['Learner']));
      const openRoute = { data: {} } as unknown as ActivatedRouteSnapshot;

      const result = TestBed.runInInjectionContext(() => roleGuard(openRoute, {} as never));

      expect(result).toBe(true);
    });
  });
});
