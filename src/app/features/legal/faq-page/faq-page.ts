import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretDown } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';

type FaqCategory = 'general' | 'learning' | 'payment' | 'technical' | 'live';
type FaqFilter = 'all' | Exclude<FaqCategory, 'general'>;

/**
 * A question/answer pair lives in the i18n dictionaries under `faq.items.<id>.q` / `.a`; this list
 * only fixes the order and the category. Every statement in those answers was checked against the
 * backend (see the task notes) — do not reintroduce claims the system does not back (card payments
 * as a given, "lifetime access" for every course, a fixed device count other than the documented
 * default, etc.).
 */
interface FaqItem {
  readonly id: string;
  readonly category: FaqCategory;
}

interface FaqFilterTab {
  readonly id: FaqFilter;
  readonly labelKey: string;
}

@Component({
  selector: 'app-faq-page',
  imports: [RouterLink, TranslatePipe, NgIcon],
  templateUrl: './faq-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretDown })],
})
export class FaqPage {
  private readonly translation = inject(TranslationService);

  readonly activeCategory = signal<FaqFilter>('all');

  readonly filters: readonly FaqFilterTab[] = [
    { id: 'all', labelKey: 'faq.catAll' },
    { id: 'learning', labelKey: 'faq.catLearning' },
    { id: 'live', labelKey: 'faq.catLive' },
    { id: 'payment', labelKey: 'faq.catPayment' },
    { id: 'technical', labelKey: 'faq.catTechnical' },
  ];

  readonly faqs: readonly FaqItem[] = [
    { id: 'about', category: 'general' },
    { id: 'access', category: 'learning' },
    { id: 'certificate', category: 'learning' },
    { id: 'liveWhat', category: 'live' },
    { id: 'liveJoin', category: 'live' },
    { id: 'liveInvites', category: 'live' },
    { id: 'liveReplay', category: 'live' },
    { id: 'liveAccess', category: 'live' },
    { id: 'liveRefund', category: 'live' },
    { id: 'invoice', category: 'payment' },
    { id: 'methods', category: 'payment' },
    { id: 'devices', category: 'technical' },
  ];

  readonly filteredFaqs = computed(() => {
    const category = this.activeCategory();
    return category === 'all' ? this.faqs : this.faqs.filter((faq) => faq.category === category);
  });

  constructor() {
    setPageMeta({
      title: `${this.translation.t('faq.pageTitle')} · ${this.translation.t('common.appName')}`,
      description: this.translation.t('faq.pageDescription'),
    });
  }

  setCategory(category: FaqFilter): void {
    this.activeCategory.set(category);
  }
}
