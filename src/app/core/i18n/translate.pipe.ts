import { Pipe, PipeTransform, inject } from '@angular/core';

import { TranslationService } from './translation.service';

/**
 * Template ergonomics wrapper around `TranslationService.t()`:
 * `{{ 'common.loading' | translate }}`, or with interpolation params:
 * `{{ 'shared.pagination.goToPage' | translate: { page: 3 } }}`.
 *
 * `pure: false`, deliberately — a pure pipe's cache keys strictly on its own *explicit* arguments
 * (`key`/`params`, via Angular's `bindingUpdated`), not on any signal merely read inside
 * `transform()`; most translation keys don't themselves change when the locale toggles, so a `pure:
 * true` version of this pipe would keep rendering the old language until something else forces the
 * binding to re-evaluate (verified empirically with a template-reactivity spec — see
 * `translate.pipe.spec.ts`; same latent bug documented on `DurationPipe`). Re-running `transform()` on
 * every change-detection cycle is the correct trade for a locale-reactive pipe here — dictionary
 * lookup is cheap and side-effect-free, so the `pure: false` cost is negligible.
 */
@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  transform(key: string, params?: Readonly<Record<string, string | number>>): string {
    return this.translation.t(key, params);
  }
}
