import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { buildTestAccessToken } from '../auth/testing/test-jwt';
import { accessTokenStore } from '../http/access-token.store';
import { guestGuard } from './guest.guard';

/** Proves the sign-in pages (`/login`, `/register`, `/forgot-password`) are guests-only. */
describe('guestGuard', () => {
  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    accessTokenStore.set(null);
  });

  it('lets a visitor without a session through to the page', () => {
    const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));

    expect(result).toBe(true);
  });

  it('redirects someone who is already signed in to the home page instead of showing the form', () => {
    accessTokenStore.set(buildTestAccessToken({ userId: 'usr-guest-guard-1' }));

    const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));

    expect(result).not.toBe(true);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe(router.serializeUrl(router.createUrlTree(['/'])));
  });
});
