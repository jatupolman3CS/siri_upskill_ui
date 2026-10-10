import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstructorApplicationStatus } from '../../features/instructor/data/instructor-profile-api.models';
import { AuthService } from '../auth/auth.service';
import { buildTestAccessToken } from '../auth/testing/test-jwt';
import { accessTokenStore } from '../http/access-token.store';
import { instructorStudioGuard } from './instructor-studio.guard';

const ME_URL = '/api/catalog/instructors/me';

function profile(status: InstructorApplicationStatus) {
  return {
    id: 'p1',
    userId: 'usr-test-001',
    displayName: 'Test Instructor',
    headline: null,
    bio: 'bio',
    revenueSharePercent: 70,
    status,
    approvedAtUtc: status === 'Approved' ? '2026-10-01T00:00:00Z' : null,
  };
}

describe('instructorStudioGuard', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  function signInWithRoles(roles: string[]): void {
    accessTokenStore.set(buildTestAccessToken({ userId: 'usr-test-001', roles }));
  }

  /** Runs the guard the way the router does; it answers with an Observable whenever it has to ask the server. */
  function runGuard(): Observable<boolean | UrlTree> {
    return TestBed.runInInjectionContext(() => instructorStudioGuard({} as never, {} as never)) as Observable<boolean | UrlTree>;
  }

  function expectApplicationPage(result: boolean | UrlTree): void {
    expect(result).not.toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/become-instructor');
  }

  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    accessTokenStore.set(null);
  });

  describe('admins', () => {
    it.each([['Admin'], ['SuperAdmin']])('lets %s straight in without asking about an instructor application', (role) => {
      signInWithRoles([role]);

      expect(runGuard()).toBe(true);
      httpMock.expectNone(ME_URL);
    });
  });

  describe('an approved application', () => {
    it('lets an Instructor in', async () => {
      signInWithRoles(['Instructor']);

      const outcome = firstValueFrom(runGuard());
      httpMock.expectOne(ME_URL).flush(profile('Approved'));

      expect(await outcome).toBe(true);
    });

    it('refreshes the access token and lets the user in when approval happened after the token was issued', async () => {
      signInWithRoles(['Learner']);
      const auth = TestBed.inject(AuthService);
      const refresh = vi.spyOn(auth, 'refreshToken').mockImplementation(() => {
        signInWithRoles(['Instructor']);
        return of('refreshed-token');
      });

      const outcome = firstValueFrom(runGuard());
      httpMock.expectOne(ME_URL).flush(profile('Approved'));

      expect(await outcome).toBe(true);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('still refuses when the refreshed token carries no Instructor role', async () => {
      signInWithRoles(['Learner']);
      vi.spyOn(TestBed.inject(AuthService), 'refreshToken').mockReturnValue(of('same-token'));

      const outcome = firstValueFrom(runGuard());
      httpMock.expectOne(ME_URL).flush(profile('Approved'));

      expectApplicationPage(await outcome);
    });
  });

  describe('everyone an admin has not approved sees only the application page', () => {
    it.each<[string, string[], InstructorApplicationStatus]>([
      ['a pending applicant', ['Learner'], 'Pending'],
      ['a rejected applicant', ['Learner'], 'Rejected'],
      ['an Instructor-role user whose application is still pending (role assigned without approval)', ['Instructor'], 'Pending'],
      ['an Instructor-role user whose application was rejected', ['Instructor'], 'Rejected'],
    ])('redirects %s to /become-instructor', async (_label, roles, status) => {
      signInWithRoles(roles);

      const outcome = firstValueFrom(runGuard());
      httpMock.expectOne(ME_URL).flush(profile(status));

      expectApplicationPage(await outcome);
    });

    it('redirects a learner who never applied (404) to /become-instructor, not to /', async () => {
      signInWithRoles(['Learner']);

      const outcome = firstValueFrom(runGuard());
      httpMock.expectOne(ME_URL).flush({ title: 'Not found' }, { status: 404, statusText: 'Not Found' });

      expectApplicationPage(await outcome);
    });

    it('does not mistake an Instructor-role user with no application at all for an approved instructor', async () => {
      signInWithRoles(['Instructor']);

      const outcome = firstValueFrom(runGuard());
      httpMock.expectOne(ME_URL).flush({ title: 'Not found' }, { status: 404, statusText: 'Not Found' });

      expectApplicationPage(await outcome);
    });

    it('fails closed when the status lookup errors out', async () => {
      signInWithRoles(['Instructor']);

      const outcome = firstValueFrom(runGuard());
      httpMock.expectOne(ME_URL).flush({ title: 'Server Error' }, { status: 500, statusText: 'Server Error' });

      expectApplicationPage(await outcome);
    });
  });
});
