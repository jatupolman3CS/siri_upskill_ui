import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import type { Booking } from '../../../data/tutoring-learner.models';
import { OpenDisputeDialog } from '../open-dispute-dialog/open-dispute-dialog';

/**
 * "Something went wrong?" on a booking (P13-14 section 9 / 14). Whether a problem can be reported is the server's call:
 * `disputeWindowEndsAtUtc` is only present while a report is possible, and `disputeId` when a case already exists - the section
 * shows the matching door and nothing else. The dialog behind the button asks the server again before it offers the form, so an
 * out-of-date page can never open a report the server would refuse. Renders nothing when neither field is present.
 */
@Component({
  selector: 'app-dispute-section',
  imports: [RouterLink, TranslatePipe, BangkokDatePipe, Button, OpenDisputeDialog],
  templateUrl: './dispute-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DisputeSection {
  readonly booking = input.required<Booking>();

  protected readonly dialogOpen = signal(false);
}
