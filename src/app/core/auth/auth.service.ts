import { Injectable, computed, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, catchError, finalize, map, of, shareReplay } from 'rxjs';

import { AuthApiService } from '../../features/auth/data/auth-api.service';
import { CurrentUserStore } from '../../features/auth/data/current-user.store';
import { accessTokenStore } from '../http/access-token.store';
import { decodeAccessToken } from './jwt.util';

export type UserRole = 'SuperAdmin' | 'Admin' | 'Instructor' | 'Learner';

/**
 * Shape of the authenticated user as exposed to the rest of the app. `id`/`roles`/`role` come from the
 * access token (the only thing the backend authorises against); `email`/`displayName`/`avatarUrl` come
 * from `GET /api/identity/me` and are `undefined` until that profile has loaded (or if it failed) —
 * UI must treat them as optional.
 */
export interface CurrentUser {
  readonly id: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
  readonly role?: UserRole;
  readonly roles?: readonly string[];
}

/**
 * Signal-based auth state. The access token lives in memory only (`accessTokenStore`); the refresh
 * token is an httpOnly cookie the browser manages, so the only way to restore a session after a reload
 * is `initSession()` → `POST /api/identity/refresh`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly authApi = inject(AuthApiService);
  private readonly currentUserStore = inject(CurrentUserStore);

  /** Whether the initial session restoration attempt has completed */
  readonly isInitialized = signal<boolean>(false);

  /**
   * `true` only in the browser, once the refresh-cookie session restore has finished. SSR can never
   * know who is signed in (the cookie restore happens client-side), so anything that would otherwise
   * flash a guest-only state to a signed-in visitor (Sign in / Register buttons) must render a neutral
   * placeholder until this is `true` — `isAuthenticated()` alone is `false` during SSR *and* before
   * the restore completes, and reads the same as "definitely a guest".
   */
  readonly sessionResolved = computed(() => this.isBrowser && this.isInitialized());

  /** Derived authentication status */
  readonly isAuthenticated = computed(() => accessTokenStore.token() !== null);

  /** Current user identity: roles from the access token, profile from `/api/identity/me`. */
  readonly currentUser = computed<CurrentUser | null>(() => {
    const token = accessTokenStore.token();
    if (token === null) {
      return null;
    }
    const decoded = decodeAccessToken(token);
    if (decoded === null) {
      return null;
    }
    const primaryRole = (decoded.roles[0] as UserRole | undefined) ?? 'Learner';
    const profile = this.currentUserStore.profile();
    return {
      id: decoded.userId,
      roles: decoded.roles,
      role: primaryRole,
      email: profile?.email,
      displayName: profile?.displayName,
      avatarUrl: profile?.avatarUrl,
    };
  });

  /**
   * Menu hint only: the token carries a studio-capable role (Instructor, Admin, SuperAdmin). The real gate is the
   * `/instructor` route's `instructorStudioGuard`, which also requires an *approved* application for non-admins and
   * sends everyone else to `/become-instructor` — so an Instructor-role user without an approval can see the menu entry
   * but never the studio.
   */
  readonly canUseInstructorStudio = computed(() => this.hasRole('Instructor') || this.hasRole('Admin'));

  /** Mirrors the `/admin` route's roleGuard (Admin, SuperAdmin). */
  readonly isAdmin = computed(() => this.hasRole('Admin'));

  private refreshInFlight$: Observable<string | null> | null = null;

  /**
   * Initializes session on application startup.
   * Runs in the browser only (skips SSR).
   * Restores the in-memory access token via `/api/identity/refresh` using the httpOnly cookie.
   */
  initSession(): Observable<boolean> {
    if (!this.isBrowser) {
      this.isInitialized.set(true);
      return of(false);
    }

    if (accessTokenStore.token() !== null) {
      this.isInitialized.set(true);
      return of(true);
    }

    return this.refreshToken().pipe(
      map((token) => token !== null),
      catchError(() => of(false)),
      finalize(() => {
        this.isInitialized.set(true);
      }),
    );
  }

  /**
   * Refreshes the access token via `/api/identity/refresh`.
   * Deduplicates concurrent calls so only one refresh request runs at a time,
   * avoiding token reuse detection triggers and race conditions.
   */
  refreshToken(): Observable<string | null> {
    if (!this.isBrowser) {
      return of(null);
    }

    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = this.authApi.refresh().pipe(
      map((response) => {
        this.setAccessToken(response.accessToken);
        return response.accessToken;
      }),
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
      finalize(() => {
        this.refreshInFlight$ = null;
      }),
      shareReplay(1),
    );

    return this.refreshInFlight$;
  }

  /** Check if the current user has a specific role */
  hasRole(role: string): boolean {
    const user = this.currentUser();
    if (!user?.roles) {
      return false;
    }
    if (user.roles.includes('SuperAdmin')) {
      return true;
    }
    return user.roles.includes(role);
  }

  /** Store access token */
  setAccessToken(accessToken: string): void {
    accessTokenStore.set(accessToken);
  }

  /** Drops the in-memory token; the profile (`CurrentUserStore`) clears itself off the same signal. */
  clearSession(): void {
    accessTokenStore.set(null);
  }

  /**
   * Full sign-out: drops in-memory token and revokes the refresh cookie on the backend.
   */
  signOut(): Observable<void> {
    const wasAuthenticated = this.isAuthenticated();
    this.clearSession();
    if (this.isBrowser && wasAuthenticated) {
      return this.authApi.logout().pipe(
        map(() => void 0),
        catchError(() => of(void 0)),
      );
    }
    return of(void 0);
  }
}
