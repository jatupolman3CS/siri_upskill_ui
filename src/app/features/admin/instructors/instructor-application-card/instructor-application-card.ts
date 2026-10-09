import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorXCircle } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { InstructorApplicationSummary } from '../data/admin-instructor-api.models';

/** Bios up to this length are shown in full; longer ones are clamped with a "read more" toggle. */
const BIO_CLAMP_THRESHOLD = 240;

/**
 * One pending instructor application. Presentational: approve / reject are outputs, the page owns the confirmation
 * dialog and the API call. The bio is clamped with a real toggle button (`aria-expanded`), not a hover reveal.
 */
@Component({
  selector: 'app-instructor-application-card',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, Button],
  templateUrl: './instructor-application-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorXCircle })],
  host: { class: 'block' },
})
export class InstructorApplicationCard {
  readonly application = input.required<InstructorApplicationSummary>();
  /** A decision is in flight: both actions are disabled. */
  readonly busy = input(false);

  readonly approve = output<InstructorApplicationSummary>();
  readonly reject = output<InstructorApplicationSummary>();

  protected readonly expanded = signal(false);

  protected isLongBio(bio: string): boolean {
    return bio.length > BIO_CLAMP_THRESHOLD;
  }

  protected toggleBio(): void {
    this.expanded.update((value) => !value);
  }
}
