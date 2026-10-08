import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, map, of, throwError, timer } from 'rxjs';

import { AuthService } from './auth.service';
import { AuthApiService } from '../../features/auth/data/auth-api.service';
import { accessTokenStore } from '../http/access-token.store';
import { buildTestAccessToken } from './testing/test-jwt';

describe('AuthService', () => {
  let service: AuthService;
  let authApi: AuthApiService;
  let httpMock: HttpTestingController;

  function makeMockJwt(userId: string, role: string): string {
    return buildTestAccessToken({ userId, roles: [role] });
  }

  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        AuthApiService,
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(AuthService);
    authApi = TestBed.inject(AuthApiService);
    httpMock = TestBed.inject(HttpTestingController);
    service.clearSession();
  });

  afterEach(() => {
    service.clearSession();
    httpMock.verify();
  });

  it('initially reports unauthenticated and guest user', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(service.hasRole('Admin')).toBe(false);
  });

  it('derives currentUser and hasRole correctly from valid JWT access token', () => {
    const token = makeMockJwt('usr-real-001', 'Admin');
    service.setAccessToken(token);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()).toEqual({
      id: 'usr-real-001',
      roles: ['Admin'],
      role: 'Admin',
      email: undefined,
      displayName: undefined,
      avatarUrl: undefined,
    });
    expect(service.hasRole('Admin')).toBe(true);
    expect(service.hasRole('Instructor')).toBe(false);
  });

  it('merges the /me profile (name, email, avatar) into currentUser once it has loaded, keeping token roles', async () => {
    service.setAccessToken(makeMockJwt('usr-profile-001', 'Instructor'));
    TestBed.tick();
    httpMock.expectOne('/api/identity/me').flush({
      id: 'usr-profile-001',
      email: 'somchai@example.test',
      displayName: 'Somchai Jaidee',
      avatarUrl: 'https://cdn.example.test/a.png',
      roles: ['Learner'],
    });
    await Promise.resolve();
    TestBed.tick();

    expect(service.currentUser()).toEqual({
      id: 'usr-profile-001',
      roles: ['Instructor'],
      role: 'Instructor',
      email: 'somchai@example.test',
      displayName: 'Somchai Jaidee',
      avatarUrl: 'https://cdn.example.test/a.png',
    });
  });

  it('keeps currentUser usable from the token alone when the /me fetch fails', async () => {
    service.setAccessToken(makeMockJwt('usr-profile-002', 'Learner'));
    TestBed.tick();
    httpMock.expectOne('/api/identity/me').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    await Promise.resolve();
    TestBed.tick();

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.id).toBe('usr-profile-002');
    expect(service.currentUser()?.displayName).toBeUndefined();
  });

  it('drops the profile again when the session is cleared', async () => {
    service.setAccessToken(makeMockJwt('usr-profile-003', 'Learner'));
    TestBed.tick();
    httpMock.expectOne('/api/identity/me').flush({
      id: 'usr-profile-003',
      email: 'a@example.test',
      displayName: 'Anna',
      avatarUrl: null,
      roles: ['Learner'],
    });
    await Promise.resolve();
    TestBed.tick();
    expect(service.currentUser()?.displayName).toBe('Anna');

    service.clearSession();
    TestBed.tick();

    expect(service.currentUser()).toBeNull();
  });

  it('SuperAdmin hasRole grants all roles', () => {
    const token = makeMockJwt('usr-super-001', 'SuperAdmin');
    service.setAccessToken(token);

    expect(service.hasRole('Admin')).toBe(true);
    expect(service.hasRole('Instructor')).toBe(true);
    expect(service.hasRole('Learner')).toBe(true);
  });

  it('offers the instructor studio and admin area only to the roles the route guards allow', () => {
    service.setAccessToken(makeMockJwt('usr-learner', 'Learner'));
    expect(service.canUseInstructorStudio()).toBe(false);
    expect(service.isAdmin()).toBe(false);

    service.setAccessToken(makeMockJwt('usr-instructor', 'Instructor'));
    expect(service.canUseInstructorStudio()).toBe(true);
    expect(service.isAdmin()).toBe(false);

    service.setAccessToken(makeMockJwt('usr-admin', 'Admin'));
    expect(service.canUseInstructorStudio()).toBe(true);
    expect(service.isAdmin()).toBe(true);

    service.setAccessToken(makeMockJwt('usr-super', 'SuperAdmin'));
    expect(service.canUseInstructorStudio()).toBe(true);
    expect(service.isAdmin()).toBe(true);
  });

  it('initSession restores session when refresh succeeds', async () => {
    const fakeToken = makeMockJwt('usr-refreshed-001', 'Learner');
    vi.spyOn(authApi, 'refresh').mockReturnValue(of({
      accessToken: fakeToken,
      accessTokenExpiresAtUtc: '2026-10-01T00:00:00Z',
    }));

    const result = await firstValueFrom(service.initSession());

    expect(result).toBe(true);
    expect(service.isInitialized()).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.id).toBe('usr-refreshed-001');
  });

  it('reports sessionResolved only in the browser and only once initSession has finished', async () => {
    expect(service.sessionResolved()).toBe(false);

    vi.spyOn(authApi, 'refresh').mockReturnValue(throwError(() => new Error('401 Unauthorized')));
    await firstValueFrom(service.initSession());

    expect(service.sessionResolved()).toBe(true);
  });

  it('initSession handles refresh failure gracefully without throwing', async () => {
    vi.spyOn(authApi, 'refresh').mockReturnValue(throwError(() => new Error('401 Unauthorized')));

    const result = await firstValueFrom(service.initSession());

    expect(result).toBe(false);
    expect(service.isInitialized()).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('refreshToken deduplicates concurrent calls so only one HTTP request is made', async () => {
    const fakeToken = makeMockJwt('usr-concurrent-001', 'Learner');
    let callCount = 0;
    vi.spyOn(authApi, 'refresh').mockImplementation(() => {
      callCount++;
      return timer(10).pipe(
        map(() => ({
          accessToken: fakeToken,
          accessTokenExpiresAtUtc: '2026-10-01T00:00:00Z',
        })),
      );
    });

    const [res1, res2] = await Promise.all([
      firstValueFrom(service.refreshToken()),
      firstValueFrom(service.refreshToken()),
    ]);

    expect(res1).toBe(fakeToken);
    expect(res2).toBe(fakeToken);
    expect(callCount).toBe(1);
  });

  it('signOut clears local session and calls authApi.logout', async () => {
    const token = makeMockJwt('usr-to-logout', 'Learner');
    service.setAccessToken(token);
    expect(service.isAuthenticated()).toBe(true);

    let logoutCalled = false;
    vi.spyOn(authApi, 'logout').mockImplementation(() => {
      logoutCalled = true;
      return of({ message: 'ok' });
    });

    await firstValueFrom(service.signOut());

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(logoutCalled).toBe(true);
  });
});

describe('AuthService on the server (SSR)', () => {
  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
  });

  it('never reports sessionResolved, because only the browser can restore the refresh-cookie session', async () => {
    const service = TestBed.inject(AuthService);

    await firstValueFrom(service.initSession());

    expect(service.isInitialized()).toBe(true);
    expect(service.sessionResolved()).toBe(false);
  });
});
