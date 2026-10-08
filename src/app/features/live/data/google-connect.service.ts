import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { LiveInstructorApiService } from './live-instructor-api.service';

/** The only origin the OAuth consent redirect may point at. */
const GOOGLE_AUTH_ORIGIN = 'https://accounts.google.com';

/**
 * Performs the top-level navigation to Google's consent screen. An injection token (not a bare `window.location.assign`)
 * so unit tests can observe the redirect without a real navigation, and so nothing touches `window` at construction time
 * (SSR-safe: the function only runs from a click handler).
 */
export const GOOGLE_AUTH_REDIRECT = new InjectionToken<(url: string) => void>('GOOGLE_AUTH_REDIRECT', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return (url: string) => document.defaultView?.location.assign(url);
  },
});

export function isGoogleAuthorizationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === GOOGLE_AUTH_ORIGIN && url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * "Connect Google Calendar": asks the API for the consent URL (`POST …/google/connect` — a POST because the server mints
 * a one-time `state`), then sends the whole window there. The SPA's bearer token lives in memory and cannot ride a
 * top-level navigation, which is why this is not a plain link.
 * <para>
 * The returned URL is checked against Google's own origin before navigating: a tampered or unexpected response must not
 * be able to turn this button into an open redirect.
 * </para>
 */
@Injectable({ providedIn: 'root' })
export class GoogleConnectService {
  private readonly api = inject(LiveInstructorApiService);
  private readonly redirect = inject(GOOGLE_AUTH_REDIRECT);

  /** Completes after the redirect has been triggered; errors (`ApiError`, or `Error` for a bad URL) leave the page as is. */
  start(returnPath: string): Observable<void> {
    return this.api.connectGoogle(returnPath).pipe(
      map(({ authorizationUrl }) => {
        if (!isGoogleAuthorizationUrl(authorizationUrl)) {
          throw new Error('unexpected_authorization_url');
        }
        this.redirect(authorizationUrl);
      }),
    );
  }
}
