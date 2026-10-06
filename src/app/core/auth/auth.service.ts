import { Injectable, computed, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, catchError, finalize, map, of, shareReplay } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthApiService } from '../../features/auth/data/auth-api.service';
import { accessTokenStore } from '../http/access-token.store';
import { decodeAccessToken } from './jwt.util';

export type UserRole = 'SuperAdmin' | 'Admin' | 'Instructor' | 'Learner' | 'Guest';

export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly roles: readonly string[];
  readonly avatarUrl?: string;
}

export const MOCK_USERS: Record<UserRole, UserProfile> = {
  SuperAdmin: {
    id: 'usr-superadmin-001',
    email: 'superadmin@siriupskill.com',
    displayName: 'สมชาย แอดมินใหญ่ (Super Admin)',
    role: 'SuperAdmin',
    roles: ['SuperAdmin', 'Admin', 'Instructor', 'Learner'],
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  },
  Admin: {
    id: 'usr-admin-001',
    email: 'admin@siriupskill.com',
    displayName: 'วิภาดา ผู้ดูแลระบบ (Admin)',
    role: 'Admin',
    roles: ['Admin', 'Instructor', 'Learner'],
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
  },
  Instructor: {
    id: 'usr-instructor-001',
    email: 'instructor@siriupskill.com',
    displayName: 'อ. ดร. ปริญญา ผู้สอนดีเด่น (Instructor)',
    role: 'Instructor',
    roles: ['Instructor', 'Learner'],
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  },
  Learner: {
    id: 'usr-learner-001',
    email: 'learner@siriupskill.com',
    displayName: 'กิตติศักดิ์ นักเรียนมุ่งมั่น (Learner)',
    role: 'Learner',
    roles: ['Learner'],
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
  },
  Guest: {
    id: 'guest',
    email: '',
    displayName: 'ผู้เยี่ยมชม (Guest)',
    role: 'Guest',
    roles: [],
  },
};

export function createMockJwt(user: UserProfile): string {
  try {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
    const payload = btoa(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        name: user.displayName,
        role: user.roles,
        exp: Math.floor(Date.now() / 1000) + 86400 * 365,
      })
    ).replace(/=/g, '');
    return `${header}.${payload}.mock_signature`;
  } catch {
    return 'mock.jwt.token';
  }
}

/**
 * Shape of the authenticated user as exposed to the rest of the app.
 */
export interface CurrentUser {
  readonly id: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly role?: UserRole;
  readonly roles?: readonly string[];
}

/**
 * Signal-based auth state with full Role & Bypass capabilities.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly authApi = inject(AuthApiService);

  /** Whether the initial session restoration attempt has completed */
  readonly isInitialized = signal<boolean>(false);

  /** Bypass flag: Defaults to false; enabled via dev switcher */
  readonly isBypassActive = signal<boolean>(false);

  /** Active role in bypass / dev mode: defaults to Guest */
  readonly currentMockRole = signal<UserRole>('Guest');

  /** Active profile details */
  readonly activeUser = computed<UserProfile>(() => MOCK_USERS[this.currentMockRole()]);

  /** Derived authentication status */
  readonly isAuthenticated = computed(() => {
    if (this.isBypassActive()) {
      return this.currentMockRole() !== 'Guest';
    }
    return accessTokenStore.token() !== null;
  });

  /** Current user identity */
  readonly currentUser = computed<CurrentUser | null>(() => {
    if (this.isBypassActive()) {
      if (this.currentMockRole() === 'Guest') {
        return null;
      }
      const u = this.activeUser();
      return {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        roles: u.roles,
      };
    }

    const token = accessTokenStore.token();
    if (token === null) {
      return null;
    }
    const decoded = decodeAccessToken(token);
    if (decoded === null) {
      return null;
    }
    const primaryRole = (decoded.roles[0] as UserRole) ?? 'Learner';
    return {
      id: decoded.userId,
      roles: decoded.roles,
      role: primaryRole,
    };
  });

  /** Mirrors the `/instructor` route's roleGuard (Instructor, Admin, SuperAdmin) so menus only offer the studio to people who can open it. */
  readonly canUseInstructorStudio = computed(() => this.hasRole('Instructor') || this.hasRole('Admin'));

  /** Mirrors the `/admin` route's roleGuard (Admin, SuperAdmin). */
  readonly isAdmin = computed(() => this.hasRole('Admin'));

  private refreshInFlight$: Observable<string | null> | null = null;

  constructor() {
    // Initialize mock token if in bypass mode — dev-only, see setBypassRole()'s doc comment.
    if (environment.devAuth.bypass && this.isBypassActive() && this.currentMockRole() !== 'Guest') {
      const mockToken = createMockJwt(MOCK_USERS[this.currentMockRole()]);
      accessTokenStore.set(mockToken);
    }
  }

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

    if (this.isBypassActive()) {
      this.isInitialized.set(true);
      return of(true);
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

  /**
   * Switch role instantly in bypass mode (SuperAdmin, Admin, Instructor, Learner, Guest).
   * DEV-BYPASS: gated on `environment.devAuth.bypass`, which is `false` in every production
   * build (`environment.ts`) — a no-op there even if called directly (e.g. from devtools),
   * not just hidden behind UI that happens not to render it.
   */
  setBypassRole(role: UserRole): void {
    if (!environment.devAuth.bypass) {
      return;
    }
    this.currentMockRole.set(role);
    if (role === 'Guest') {
      accessTokenStore.set(null);
    } else {
      this.isBypassActive.set(true);
      const mockToken = createMockJwt(MOCK_USERS[role]);
      accessTokenStore.set(mockToken);
    }
  }

  /**
   * Toggle bypass mode on/off. DEV-BYPASS: see `setBypassRole()`'s doc comment.
   */
  toggleBypass(enabled?: boolean): void {
    if (!environment.devAuth.bypass) {
      return;
    }
    const newState = enabled !== undefined ? enabled : !this.isBypassActive();
    this.isBypassActive.set(newState);
    if (newState && this.currentMockRole() !== 'Guest') {
      accessTokenStore.set(createMockJwt(MOCK_USERS[this.currentMockRole()]));
    }
  }

  /** Check if the current user has a specific role */
  hasRole(role: string): boolean {
    if (this.isBypassActive()) {
      if (this.currentMockRole() === 'SuperAdmin') return true;
      return this.activeUser().roles.includes(role);
    }
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

  /** Drops in-memory token and resets to Guest */
  clearSession(): void {
    accessTokenStore.set(null);
    this.currentMockRole.set('Guest');
  }

  /**
   * Full sign-out: drops in-memory token, resets role, and revokes the refresh cookie on the backend.
   */
  signOut(): Observable<void> {
    const wasAuthenticated = this.isAuthenticated() && !this.isBypassActive();
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
