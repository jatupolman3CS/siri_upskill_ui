import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';

@Component({
  selector: 'app-terms-page',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './terms-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {
  private readonly translation = inject(TranslationService);

  constructor() {
    setPageMeta({
      title: `${this.translation.t('legal.terms.pageTitle')} · ${this.translation.t('common.appName')}`,
      description: this.translation.t('legal.terms.pageDescription'),
    });
  }
}
