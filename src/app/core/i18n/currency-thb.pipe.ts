import { CurrencyPipe } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';

import { TranslationService } from './translation.service';

/**
 * Formats a THB amount for the locale currently selected in `TranslationService` — this platform's
 * only currency (docs/PAYMENT.md: Stripe PromptPay, THB-only), so unlike `DatePipe`'s existing
 * `'Asia/Bangkok'`/`'th-TH'` usage (`DevicesPage`), there is no per-call currency code to accept.
 * Wraps Angular's own `CurrencyPipe` rather than hand-formatting — number-grouping/decimal rules stay
 * correct for both locales for free, this only decides *which* locale to format with.
 * <para>
 * `pure: false`, deliberately — a pure pipe's cache keys strictly on its own *explicit* arguments
 * (`value`, via Angular's `bindingUpdated`), not on any signal merely read inside `transform()`; a
 * price doesn't itself change when the locale toggles, so a `pure: true` version of this pipe would
 * keep rendering the old locale's grouping/decimal format until something else forces the binding to
 * re-evaluate (verified empirically with a template-reactivity spec — see `currency-thb.pipe.spec.ts`;
 * same latent bug documented on `DurationPipe`). Re-running `transform()` on every change-detection
 * cycle is the correct trade for a locale-reactive pipe here — this delegates to `CurrencyPipe` and
 * does no I/O, so the `pure: false` cost is negligible.
 * </para>
 */
@Pipe({ name: 'currencyThb', pure: false })
export class CurrencyThbPipe implements PipeTransform {
  private readonly currencyPipe = inject(CurrencyPipe);
  private readonly translation = inject(TranslationService);

  transform(value: number | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const locale = this.translation.locale() === 'th' ? 'th-TH' : 'en-US';
    return this.currencyPipe.transform(value, 'THB', 'symbol-narrow', '1.2-2', locale);
  }
}
