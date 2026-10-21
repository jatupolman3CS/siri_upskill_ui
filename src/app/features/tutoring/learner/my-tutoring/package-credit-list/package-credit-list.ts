import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { StatusChip } from '../../../../live/instructor/ui/status-chip/status-chip';
import type { PackageCreditDto } from '../../../data/tutoring-package-purchase.models';
import { creditStatusView } from '../../../data/tutoring-package.util';

/**
 * The credits of one package purchase, one per lesson of the package: its status (still available, held by a booked lesson, used,
 * expired or refunded) and, when a lesson holds or used it, when that lesson is and a link to it. The statuses and times are the
 * server's; the list is shown in the order it arrives.
 */
@Component({
  selector: 'app-package-credit-list',
  imports: [RouterLink, TranslatePipe, BangkokDatePipe, StatusChip],
  templateUrl: './package-credit-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PackageCreditList {
  readonly credits = input.required<readonly PackageCreditDto[]>();

  protected readonly statusView = creditStatusView;
}
