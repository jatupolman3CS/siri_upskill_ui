import { CurrencyPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { PayoutPolicyStore } from '../../data/payout-policy.store';

/** Shown instead of a number whenever the server's policy is not (yet) available. */
const NO_VALUE = '—';

/**
 * Renders one i18n sentence whose numbers come from `GET /api/payout/policy` — never from a literal.
 * The page that uses it must list `PayoutPolicyStore` in its own `providers` (one fetch per page).
 *
 * Available tokens inside the i18n string: `{{percent}}` (the caller's instructor share),
 * `{{platformPercent}}`, `{{withholdingPercent}}`, `{{minAmount}}` (formatted THB) and `{{holdDays}}`.
 *
 * - **ready**: the sentence with real, locale-formatted values.
 * - **loading**: a skeleton line (sentence mode) or the sentence with `—` in place of every number
 *   (`inline` mode, for table headers/labels where a block-level skeleton would break the layout).
 * - **error**: the sentence with `—` in place of every number, plus (sentence mode, `retryable`) a
 *   button that refetches. No number is ever invented while the server value is unknown.
 */
@Component({
  selector: 'app-payout-policy-text',
  imports: [Skeleton, TranslatePipe],
  // CurrencyThbPipe resolves Angular's CurrencyPipe via DI (it is not providedIn: 'root'); PercentPipe
  // is listed for the same reason. Listing them here keeps the component self-contained.
  providers: [CurrencyPipe, PercentPipe, CurrencyThbPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-busy]': "state() === 'loading' ? 'true' : null",
  },
  template: `
    @if (state() === 'loading' && !inline()) {
      <span class="sr-only">{{ 'common.loading' | translate }}</span>
      <app-skeleton variant="text" [width]="skeletonWidth()" />
    } @else {
      <span>{{ text() }}</span>
      @if (state() === 'error' && !inline() && retryable()) {
        <button
          type="button"
          (click)="store.reload()"
          class="ml-1 inline-flex min-h-11 items-center font-semibold text-[var(--color-primary-text)] underline"
        >
          {{ 'payout.policy.reload' | translate }}
        </button>
      }
    }
  `,
})
export class PayoutPolicyText {
  protected readonly store = inject(PayoutPolicyStore);
  private readonly translation = inject(TranslationService);
  private readonly currencyThb = inject(CurrencyThbPipe);
  private readonly percentPipe = inject(PercentPipe);

  /** i18n key of the sentence to render (must use the tokens documented on the class). */
  readonly messageKey = input.required<string>();
  /** Use `—` placeholders instead of a skeleton / retry button (table headers, short labels). */
  readonly inline = input(false);
  /** Whether the error state offers a retry button (sentence mode only). Pass `false` on repeats. */
  readonly retryable = input(true);
  readonly skeletonWidth = input('60%');

  protected readonly state = computed<'ready' | 'loading' | 'error'>(() => {
    if (this.store.policy() !== undefined) {
      return 'ready';
    }
    return this.store.hasError() ? 'error' : 'loading';
  });

  private readonly params = computed<Record<string, string>>(() => {
    const policy = this.store.policy();
    if (policy === undefined) {
      return {
        percent: NO_VALUE,
        platformPercent: NO_VALUE,
        withholdingPercent: NO_VALUE,
        minAmount: NO_VALUE,
        holdDays: NO_VALUE,
      };
    }
    const locale = this.translation.locale() === 'th' ? 'th-TH' : 'en-US';
    return {
      percent: this.formatPercent(policy.revenueSharePercent, locale),
      platformPercent: this.formatPercent(policy.platformSharePercent, locale),
      withholdingPercent: this.formatPercent(policy.withholdingTaxPercent, locale),
      minAmount: this.currencyThb.transform(policy.minimumPayoutAmount) ?? NO_VALUE,
      holdDays: String(policy.holdDays),
    };
  });

  protected readonly text = computed(() => this.translation.t(this.messageKey(), this.params()));

  /** The API sends whole-number percents (70), `PercentPipe` expects a fraction (0.7). */
  private formatPercent(percent: number, locale: string): string {
    return this.percentPipe.transform(percent / 100, '1.0-2', locale) ?? NO_VALUE;
  }
}
