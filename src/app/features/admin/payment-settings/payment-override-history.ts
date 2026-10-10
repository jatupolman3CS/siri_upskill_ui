import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorClockCounterClockwise, phosphorToggleLeft, phosphorToggleRight } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Button } from '../../../shared/button/button';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Pagination } from '../../../shared/pagination/pagination';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { PaymentAmountOverrideEntry } from './data/payment-amount-override.models';
import { shortId } from './payment-override-form.util';

export type PaymentOverrideHistoryView = 'loading' | 'error' | 'empty' | 'ready';

/**
 * The append-only audit log, newest first. Purely presentational: the page owns the request and tells this component
 * which of the four states to draw. The table scrolls inside its own box on narrow screens (never the page body).
 */
@Component({
  selector: 'app-payment-override-history',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, EmptyState, Pagination, Skeleton],
  templateUrl: './payment-override-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorClockCounterClockwise, phosphorToggleLeft, phosphorToggleRight })],
  host: { class: 'block' },
})
export class PaymentOverrideHistory {
  readonly view = input.required<PaymentOverrideHistoryView>();
  readonly entries = input<readonly PaymentAmountOverrideEntry[]>([]);
  /** Two-way: the page the admin is on. */
  readonly page = model(1);
  readonly totalPages = input(0);
  readonly retry = output<void>();

  protected readonly shortId = shortId;
}
