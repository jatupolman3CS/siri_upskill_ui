import { PLATFORM_ID, computed, inject, Injectable } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';

import { decodeAccessTokenUserId } from '../../../core/auth/jwt.util';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { MeResponse } from './auth-api.models';
import { AuthApiService } from './auth-api.service';

/**
 * Holds the signed-in user's own profile (`GET /api/identity/me`: display name, email, avatar) — the
 * access token only carries the user id and roles, so anything a header/account menu wants to *show*
 * about the person comes from here.
 * <para>
 * Loaded once per session: the resource is keyed on the user id read out of the in-memory access
 * token, not on the token itself, so the 15-minute token refresh (same user, new token) never
 * refetches, while signing out (token cleared → no params → idle, value dropped) and signing in as
 * somebody else (new id → reload) both do exactly the right thing. It deliberately reads
 * `accessTokenStore` rather than `AuthService`, because `AuthService` merges this profile into its own
 * `currentUser` and must be able to depend on this store without a cycle.
 * </para>
 * <para>
 * Browser only: the refresh-cookie session restore never happens during SSR, so there is never a token
 * (and never a profile) to fetch there.
 * </para>
 * <para>
 * `profile` is the only safe read: a settled error leaves `meResource.value()` throwing (Angular's
 * `resource()` rethrows there regardless of `defaultValue`), so every read goes through `hasValue()`.
 * A failed or still-loading fetch is simply `null` — callers fall back to what the access token knows.
 * </para>
 */
@Injectable({ providedIn: 'root' })
export class CurrentUserStore {
  private readonly authApi = inject(AuthApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly sessionUserId = computed(() => {
    const token = accessTokenStore.token();
    return token === null ? null : decodeAccessTokenUserId(token);
  });

  private readonly meResource = rxResource({
    params: () => (this.isBrowser ? (this.sessionUserId() ?? undefined) : undefined),
    stream: () => this.authApi.getMe(),
  });

  /** The loaded profile of the user the access token belongs to; `null` while loading, on error, or signed out. */
  readonly profile = computed<MeResponse | null>(() => {
    if (!this.meResource.hasValue()) {
      return null;
    }
    const me = this.meResource.value();
    // A response that landed for a previous user id must never be shown as the current user's.
    return me.id.toLowerCase() === this.sessionUserId()?.toLowerCase() ? me : null;
  });

  readonly isLoading = computed(() => this.meResource.isLoading());

  /** `true` when the last `/me` fetch failed — the UI keeps working off the access token's claims. */
  readonly hasError = computed(() => this.meResource.status() === 'error');
}
