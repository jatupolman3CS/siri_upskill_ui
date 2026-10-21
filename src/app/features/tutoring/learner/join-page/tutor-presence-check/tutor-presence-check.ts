import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, inject, input, signal } from '@angular/core';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { MAX_TIMER_MS, msUntil } from '../../../../live/learner/live-clock';
import type { Guid, IsoUtc } from '../../../data/tutoring-classes.models';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { TutoringSessionApiService } from '../../../data/tutoring-session-api.service';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { TUTOR_PRESENT_PROMPT_AFTER_MS } from '../tutoring-join-state';

type PresenceStep = 'waiting' | 'asking' | 'sending' | 'thanks' | 'dismissed';

/**
 * "Has the tutor joined the room?" - asked of a LEARNER on the join page, five minutes after the class was due to start (on the
 * server-corrected clock). A "yes" tells the server the tutor is present (P13-10 section 4.5), which is evidence the attendance
 * decision uses; it is the learner's own statement and the server decides what it is worth. "Not yet" simply closes the question
 * without calling anything. The question appears as a polite status so a screen-reader user hears it once; there is no countdown.
 * The server may have switched the attestation off or may not count the caller as a participant: either answer is shown as an
 * error with a way to dismiss it.
 */
@Component({
  selector: 'app-tutor-presence-check',
  imports: [TranslatePipe, Button, TutorProblem],
  templateUrl: './tutor-presence-check.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TutorPresenceCheck {
  private readonly api = inject(TutoringSessionApiService);
  private readonly i18n = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessionId = input.required<Guid>();
  readonly startsAtUtc = input.required<IsoUtc>();
  /** `serverNow - deviceNow` in ms. */
  readonly offsetMs = input(0);

  protected readonly step = signal<PresenceStep>('waiting');
  protected readonly problem = signal<string | null>(null);

  constructor() {
    afterNextRender(() => {
      const startsAt = Date.parse(this.startsAtUtc());
      if (Number.isNaN(startsAt)) {
        return;
      }
      const dueAtUtc = new Date(startsAt + TUTOR_PRESENT_PROMPT_AFTER_MS).toISOString();
      const remaining = msUntil(dueAtUtc, this.offsetMs()) ?? 0;
      if (remaining <= 0) {
        this.step.set('asking');
      } else if (remaining <= MAX_TIMER_MS) {
        const timer = setTimeout(() => this.step.update((step) => (step === 'waiting' ? 'asking' : step)), remaining);
        this.destroyRef.onDestroy(() => clearTimeout(timer));
      }
    });
  }

  protected confirm(): void {
    if (this.step() === 'sending') {
      return;
    }
    this.step.set('sending');
    this.problem.set(null);
    this.api.markTutorPresent(this.sessionId()).subscribe({
      next: () => this.step.set('thanks'),
      error: (error: unknown) => {
        this.step.set('asking');
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }

  protected dismiss(): void {
    this.problem.set(null);
    this.step.set('dismissed');
  }
}
