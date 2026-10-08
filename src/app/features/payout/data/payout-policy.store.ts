import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { PayoutApiService } from './payout-api.service';

/**
 * Single fetch of `GET /api/payout/policy` shared by every piece of revenue-policy copy on a page.
 *
 * Deliberately NOT `providedIn: 'root'`: `revenueSharePercent` is caller-specific (the instructor's
 * own share, or the system default for applicants/admins), so a root-level cache would leak one
 * user's figure to the next after a logout/login in the same tab. Each page lists this class in its
 * own `providers` instead, which gives exactly one fetch per page load and a fresh value on every
 * visit. The fetch only starts once something actually injects the store (i.e. the first
 * `PayoutPolicyText` that renders), so a page branch that never shows policy copy never pays for it.
 *
 * No `defaultValue` on purpose — there is no meaningful "empty policy" to fabricate, and a made-up
 * number is exactly what this store exists to get rid of. `policy()` is `undefined` until a real server
 * response arrives (and stays `undefined` after an error), and every read of the resource goes
 * through `hasValue()` because `resource.value()` THROWS while the status is `'error'`.
 */
@Injectable()
export class PayoutPolicyStore {
  private readonly api = inject(PayoutApiService);

  private readonly policyResource = rxResource({
    stream: () => this.api.getPayoutPolicy(),
  });

  /** The server's policy, or `undefined` while loading / after a failed fetch. */
  readonly policy = computed(() => (this.policyResource.hasValue() ? this.policyResource.value() : undefined));

  /** True only for the first load — a reload with a value already on screen keeps showing that value. */
  readonly isLoading = computed(() => this.policyResource.isLoading() && !this.policyResource.hasValue());

  readonly hasError = computed(() => this.policyResource.error() !== undefined && !this.policyResource.hasValue());

  reload(): void {
    this.policyResource.reload();
  }
}
