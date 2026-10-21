import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import type { AdminDisputeDetail } from '../../data/admin-dispute.models';
import { isActiveDispute } from '../dispute-view.util';

/**
 * The outcome side of a dispute (P13-26): while the case is open, the way to decide it; once decided, what was decided (kind of
 * resolution, the refund the server recorded, the note both parties read, whether the no-show was overturned) and what became of
 * the optional tutor suspension; and, for an appeal that needs compensation, the open follow-up with its "done outside the system"
 * button. A closed or withdrawn case offers nothing to do. Presentational: the page owns the dialogs.
 */
@Component({
  selector: 'app-dispute-decision-card',
  imports: [TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button],
  templateUrl: './dispute-decision-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class DisputeDecisionCard {
  readonly detail = input.required<AdminDisputeDetail>();
  /** Open the decision dialog. */
  readonly decide = output<void>();
  /** Open the "compensation settled" dialog. */
  readonly settle = output<void>();

  protected readonly active = computed(() => isActiveDispute(this.detail().status));
  protected readonly needsFollowUp = computed(() => this.detail().compensationRequired && !this.detail().compensationSettled);
  protected readonly followUpDone = computed(() => this.detail().compensationRequired && this.detail().compensationSettled);
}
