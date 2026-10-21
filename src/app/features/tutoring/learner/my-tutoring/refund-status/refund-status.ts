import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorHourglass, phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import type { Guid } from '../../../data/tutoring-learner.models';
import { TutoringLearnerApiService } from '../../../data/tutoring-learner-api.service';
import type { BookingRefundSummary, RefundDisplayStatus } from '../../../data/tutoring-my-bookings.models';

const ICONS: Readonly<Record<RefundDisplayStatus, string>> = {
  Requested: 'phosphorHourglass',
  Processing: 'phosphorHourglass',
  Completed: 'phosphorCheckCircle',
  Failed: 'phosphorWarningCircle',
};
const TONES: Readonly<Record<RefundDisplayStatus, string>> = {
  Requested: 'tone-blue',
  Processing: 'tone-blue',
  Completed: 'tone-green',
  Failed: 'tone-gold',
};

/**
 * The refunds of one booking, in the words a learner needs (P13-08 section 12): in progress, refunded, or "our team is looking
 * into it - nothing for you to do". A PromptPay refund is asynchronous, so while it is in progress the line says plainly that
 * Stripe will e-mail for bank details. Amounts and statuses are the server's; nothing is added up or derived here, and no provider
 * code is ever shown. Renders nothing when the booking has no refund. Each refund is announced once through its text, not live.
 */
@Component({
  selector: 'app-refund-status',
  imports: [NgIcon, TranslatePipe, CurrencyThbPipe, BangkokDatePipe],
  templateUrl: './refund-status.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorCheckCircle, phosphorHourglass, phosphorWarningCircle })],
  host: { class: 'block' },
})
export class RefundStatus {
  private readonly api = inject(TutoringLearnerApiService);

  readonly bookingId = input.required<Guid>();

  private readonly refundsResource = rxResource({
    params: () => this.bookingId(),
    stream: ({ params }) => this.api.listRefunds(params),
  });
  protected readonly refunds = computed<readonly BookingRefundSummary[]>(() => (this.refundsResource.hasValue() ? this.refundsResource.value() : []));
  protected readonly isLoading = computed(() => this.refundsResource.isLoading() && !this.refundsResource.hasValue());
  protected readonly hasError = computed(() => this.refundsResource.status() === 'error');

  protected iconOf(status: RefundDisplayStatus): string {
    return ICONS[status];
  }

  protected toneOf(status: RefundDisplayStatus): string {
    return TONES[status];
  }

  /** A refund that is still on its way and is paid back by bank transfer outside the platform. */
  protected needsBankNote(refund: BookingRefundSummary): boolean {
    return refund.isAsync && (refund.status === 'Requested' || refund.status === 'Processing');
  }

  protected reload(): void {
    this.refundsResource.reload();
  }
}
