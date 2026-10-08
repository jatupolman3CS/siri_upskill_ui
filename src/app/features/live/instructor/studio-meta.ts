import { effect, inject } from '@angular/core';

import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';

/**
 * Title/description for an instructor-studio page: always `noindex` (frontend.md — `/instructor/**` is CSR + noindex) and
 * re-applied when the TH/EN toggle flips, because the title lives outside the template. Call from a constructor / field
 * initializer (needs an injection context).
 */
export function trackStudioMeta(titleKey: string, descriptionKey: string, path: () => string): void {
  const seo = inject(SeoService);
  const i18n = inject(TranslationService);

  effect(() => {
    seo.set({
      title: i18n.t(titleKey),
      description: i18n.t(descriptionKey),
      path: path(),
      robots: 'noindex',
    });
  });
}
