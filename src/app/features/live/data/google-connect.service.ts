import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { LiveInstructorApiService } from './live-instructor-api.service';

/** The only origin the OAuth consent redirect may point at. */
const GOOGLE_AUTH_ORIGIN = 'https://accounts.google.com';

/** `sessionStorage` key (per tab, non-sensitive): "this tab just sent the instructor to the recording consent screen". */
export const RECORDING_ACCESS_MARKER = 'siri.live.recordingAccessPending';

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
  private readonly document = inject(DOCUMENT);

  /** Completes after the redirect has been triggered; errors (`ApiError`, or `Error` for a bad URL) leave the page as is. */
  start(returnPath: string): Observable<void> {
    return this.api.connectGoogle(returnPath).pipe(map(({ authorizationUrl }) => this.goToGoogle(authorizationUrl)));
  }

  /**
   * The optional second consent for automatic recording import (`P11-13`). Same redirect, same origin check; it additionally
   * leaves a one-shot marker so the page can tell the returning callback apart from a calendar connect (both come back as
   * `?google=connected`).
   */
  startRecordingAccess(returnPath: string): Observable<void> {
    return this.api
      .connectRecordingAccess(returnPath)
      .pipe(map(({ authorizationUrl }) => this.goToGoogle(authorizationUrl, () => this.setRecordingAccessPending())));
  }

  /** True once if this browser tab started a recording consent that is now returning; clears the marker either way. */
  consumeRecordingAccessPending(): boolean {
    try {
      const storage = this.document.defaultView?.sessionStorage;
      const pending = storage?.getItem(RECORDING_ACCESS_MARKER) === '1';
      storage?.removeItem(RECORDING_ACCESS_MARKER);
      return pending;
    } catch {
      return false;
    }
  }

  private setRecordingAccessPending(): void {
    try {
      this.document.defaultView?.sessionStorage.setItem(RECORDING_ACCESS_MARKER, '1');
    } catch {
      // Storage can be blocked (private window): the only cost is a generic success toast afterwards.
    }
  }

  private goToGoogle(authorizationUrl: string, beforeRedirect?: () => void): void {
    if (!isGoogleAuthorizationUrl(authorizationUrl)) {
      throw new Error('unexpected_authorization_url');
    }
    beforeRedirect?.();
    this.redirect(authorizationUrl);
  }
}
