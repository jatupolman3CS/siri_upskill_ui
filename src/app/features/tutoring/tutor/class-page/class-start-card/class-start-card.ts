import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowSquareOut, phosphorCheckCircle, phosphorInfo, phosphorVideoCamera } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { isHttpsUrl } from '../../../../live/data/live-instructor.util';
import { tutorAttendanceMissing } from '../../../data/tutor-class-view.util';
import type { Guid, TutorAttendanceResponse } from '../../../data/tutoring-classes.models';
import { TutoringClassesApiService } from '../../../data/tutoring-classes-api.service';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../../data/tutoring-errors';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

/**
 * "Start class" (P13-25) - the PRIMARY way into the room, and the card says why: starting from here is what records that the
 * tutor was present (P13-10 section 4.4), which the attendance decision - and so refunds and payment - rests on. Joining from a
 * Meet link in a calendar bypasses the platform and may not count. The server decides whether the class can be started now
 * (join window, room ready, class still open); its refusal is shown with the time the window opens. The room link comes back
 * once, is held in this component's signal only and is shown as a plain link to open in a new tab (it is never stored,
 * logged or put in a URL), so it is gone when the tutor leaves the page.
 */
@Component({
  selector: 'app-class-start-card',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, Button, TutorProblem],
  templateUrl: './class-start-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowSquareOut, phosphorCheckCircle, phosphorInfo, phosphorVideoCamera })],
  host: { class: 'block' },
})
export class ClassStartCard {
  private readonly api = inject(TutoringClassesApiService);
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(TranslationService);

  readonly sessionId = input.required<Guid>();
  readonly attendance = input.required<TutorAttendanceResponse>();
  /** The tutor was recorded as present: the page should look again. */
  readonly started = output<void>();
  /** The room is the problem (preparing / needs the tutor): the page can point at the room card. */
  readonly roomBlocked = output<void>();

  protected readonly starting = signal(false);
  protected readonly problem = signal<string | null>(null);
  /** When a "window not open" refusal says the class can start (UTC). */
  protected readonly opensAtUtc = signal<string | null>(null);
  /** The room link of this visit. Never leaves this component. */
  private readonly roomUrl = signal<string | null>(null);
  protected readonly openUrl = computed(() => {
    const url = this.roomUrl();
    return url !== null && isHttpsUrl(url) ? url : null;
  });
  protected readonly present = computed(() => !tutorAttendanceMissing(this.attendance()));

  protected start(): void {
    if (this.starting()) {
      return;
    }
    this.starting.set(true);
    this.problem.set(null);
    this.opensAtUtc.set(null);
    this.api.startClass(this.sessionId()).subscribe({
      next: (joined) => {
        this.starting.set(false);
        this.roomUrl.set(joined.meetUrl);
        this.tryOpen(joined.meetUrl);
        this.started.emit();
      },
      error: (error: unknown) => {
        this.starting.set(false);
        const detail = tutoringProblemOf(error);
        if (tutoringReasonOf(error) === 'tutoring.window_not_open' && detail?.opensAtUtc) {
          this.opensAtUtc.set(detail.opensAtUtc);
        }
        if (tutoringReasonOf(error) === 'tutoring.room_not_ready') {
          this.roomBlocked.emit();
        }
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }

  /** Best effort: a browser may block a window opened outside a click, which is why the link stays on the page too. */
  private tryOpen(url: string): void {
    if (isHttpsUrl(url)) {
      this.document.defaultView?.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}
