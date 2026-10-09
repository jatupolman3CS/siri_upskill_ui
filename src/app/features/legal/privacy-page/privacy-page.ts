import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { LEGAL_CONTACT_EMAILS } from '../legal-contact';

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './privacy-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  private readonly translation = inject(TranslationService);

  protected readonly emails = LEGAL_CONTACT_EMAILS;

  constructor() {
    setPageMeta({
      title: `${this.translation.t('legal.privacy.pageTitle')} · ${this.translation.t('common.appName')}`,
      description: this.translation.t('legal.privacy.pageDescription'),
    });
  }
}
