import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { bookingStatusLabelKey, curriculumLabelKey, formatLabelKey, gradeLabelKey, levelLabelKey } from '../../../data/tutoring-labels';
import type { Booking } from '../../../data/tutoring-learner.models';

/**
 * The order summary beside the checkout: what was booked, for whom and when, and the server's price. Everything is read from
 * the booking the server returned - the page never adds, multiplies or rounds an amount. Times are Asia/Bangkok.
 */
@Component({
  selector: 'app-checkout-summary',
  imports: [TranslatePipe, BangkokDatePipe, CurrencyThbPipe],
  templateUrl: './checkout-summary.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  host: { class: 'block' },
})
export class CheckoutSummary {
  readonly booking = input.required<Booking>();

  private readonly translation = inject(TranslationService);
  protected readonly subject = computed(() => {
    const offering = this.booking().offering;
    return this.translation.locale() === 'th' ? offering.subjectNameTh : offering.subjectNameEn;
  });
  protected readonly levelKey = computed(() => levelLabelKey(this.booking().offering.level));
  protected readonly curriculumKey = computed(() => curriculumLabelKey(this.booking().offering.curriculum));
  protected readonly formatKey = computed(() => formatLabelKey(this.booking().format));
  protected readonly gradeKey = computed(() => gradeLabelKey(this.booking().learner.gradeLevel));
  protected readonly statusKey = computed(() => bookingStatusLabelKey(this.booking().status));
}
