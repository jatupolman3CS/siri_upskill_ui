import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_COOKIE_NAME = 'siri_theme';
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value);
}

/**
 * Light / dark / system theme switch (D-24).
 *
 * The user's choice lives in the `siri_theme` cookie — a cookie rather than localStorage so the value
 * is also visible to the inline bootstrap script in index.html, which sets `data-theme` on `<html>`
 * before first paint (no flash of the wrong theme). That attribute is the single thing the CSS
 * reads: tokens.css overrides under `:root[data-theme='dark']`, and `@custom-variant dark` in
 * styles.css points Tailwind's `dark:` utilities at it. This service keeps the attribute and the
 * cookie in sync afterwards, and follows OS changes while the preference is "system".
 *
 * SSR: nothing here touches the document on the server (`isPlatformBrowser` guard). The server
 * renders the default state ("system" selected, light tokens); the inline script corrects the
 * attribute on the client before paint, and this service corrects the signals during construction.
 * The toggle's template is identical for every preference (only attribute values differ), so that
 * correction cannot cause a hydration mismatch.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _preference = signal<ThemePreference>('system');
  private readonly systemPrefersDark = signal(false);

  /** What the user picked. "system" until a cookie or an explicit choice says otherwise. */
  readonly preference = this._preference.asReadonly();

  /** The theme actually applied — "system" resolved against the OS preference. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this._preference();
    if (preference === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return preference;
  });

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    const stored = this.readCookie();
    if (stored !== null) {
      this._preference.set(stored);
    }

    this.watchSystemPreference();
    this.applyToDocument();
  }

  set(preference: ThemePreference): void {
    this._preference.set(preference);
    if (!this.isBrowser) {
      return;
    }
    this.writeCookie(preference);
    this.applyToDocument();
  }

  private watchSystemPreference(): void {
    const view = this.document.defaultView;
    if (view === null || typeof view.matchMedia !== 'function') {
      return;
    }

    const query = view.matchMedia(DARK_MEDIA_QUERY);
    this.systemPrefersDark.set(query.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      this.systemPrefersDark.set(event.matches);
      this.applyToDocument();
    };
    query.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }

  private applyToDocument(): void {
    this.document.documentElement.setAttribute('data-theme', this.resolved());
  }

  private readCookie(): ThemePreference | null {
    try {
      const match = new RegExp(`(?:^|;\\s*)${THEME_COOKIE_NAME}=([^;]*)`).exec(this.document.cookie);
      const value = match?.[1];
      return isThemePreference(value) ? value : null;
    } catch {
      // Cookie access can throw in sandboxed documents; fall back to "system".
      return null;
    }
  }

  private writeCookie(preference: ThemePreference): void {
    try {
      const secure = this.document.location?.protocol === 'https:' ? '; Secure' : '';
      this.document.cookie =
        `${THEME_COOKIE_NAME}=${preference}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    } catch {
      // The choice still applies for this session; it just will not persist.
    }
  }
}
