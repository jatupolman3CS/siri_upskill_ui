import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowsClockwise, phosphorLinkSimple, phosphorPlugs } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { InputField } from '../../../../../shared/input/input';
import { Spinner } from '../../../../../shared/spinner/spinner';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { GoogleConnectService } from '../../../data/google-connect.service';
import { LiveInstructorApiService } from '../../../data/live-instructor-api.service';
import type { InstructorMeetingSummary } from '../../../data/live-instructor.models';
import {
  ALLOWED_MEETING_HOSTS,
  type ProblemMessage,
  instructorProblemMessage,
  isHttpsUrl,
  meetingErrorKey,
} from '../../../data/live-instructor.util';

type Busy = 'link' | 'resync' | 'connect' | null;

/**
 * The action the instructor can take on one session's room, chosen ONLY from the server-derived `needsAction`
 * (`PasteLink` -> link field, `ReconnectGoogle` -> connect button, `Retry` -> resync, `Waiting` -> status text). The UI
 * never re-derives this from `syncStatus`. A saved link is never echoed back: the API response has no URL and the field is
 * cleared after a successful save.
 */
@Component({
  selector: 'app-live-meeting-actions',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, Button, InputField, Spinner],
  templateUrl: './meeting-actions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowsClockwise, phosphorLinkSimple, phosphorPlugs })],
  host: { class: 'block' },
})
export class MeetingActions {
  private readonly api = inject(LiveInstructorApiService);
  private readonly googleConnect = inject(GoogleConnectService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly sessionId = input.required<string>();
  readonly meeting = input.required<InstructorMeetingSummary>();
  /** `false` = the server has no Google OAuth client (hide the connect button). `null` = not known yet — allow it. */
  readonly googleConfigured = input<boolean | null>(null);
  /** Where Google should send the instructor back to — must start with `/instructor/`. */
  readonly returnPath = input.required<string>();
  readonly meetingChange = output<InstructorMeetingSummary>();

  protected readonly linkControl = new FormControl('', { nonNullable: true });
  protected readonly busy = signal<Busy>(null);
  protected readonly problem = signal<ProblemMessage | null>(null);
  private readonly pasteRequested = signal(false);
  protected readonly linkError = signal<string | null>(null);

  protected readonly needsAction = computed(() => this.meeting().needsAction);
  /** Paste is the primary action for `PasteLink`, and an opt-in alternative while reconnecting / after a failure. */
  protected readonly showPaste = computed(() => this.needsAction() === 'PasteLink' || this.pasteRequested());
  protected readonly canOfferPaste = computed(() => ['ReconnectGoogle', 'Retry'].includes(this.needsAction()));
  protected readonly canConnect = computed(() => this.googleConfigured() !== false);
  protected readonly errorHint = computed(() => meetingErrorKey(this.meeting().errorCode));
  protected readonly problemText = computed(() => {
    const message = this.problem();
    return message ? this.i18n.t(message.key, message.params) : null;
  });

  protected togglePaste(): void {
    this.pasteRequested.update((value) => !value);
    this.linkError.set(null);
  }

  protected submitLink(event: Event): void {
    // Native <form> without NgForm: block the browser's own submit (a full page reload) ourselves.
    event.preventDefault();
    this.saveLink();
  }

  protected saveLink(): void {
    if (this.busy()) {
      return;
    }
    const value = this.linkControl.value.trim();
    if (!isHttpsUrl(value)) {
      this.linkError.set(this.i18n.t('live.errors.linkInvalid', { hosts: ALLOWED_MEETING_HOSTS }));
      return;
    }
    this.linkError.set(null);
    this.problem.set(null);
    this.busy.set('link');
    this.api.setMeetingLink(this.sessionId(), value).subscribe({
      next: (summary) => {
        this.linkControl.reset('');
        this.pasteRequested.set(false);
        this.busy.set(null);
        this.toast.success(this.i18n.t('live.instructor.actions.linkSaved'));
        this.meetingChange.emit(summary);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected resync(): void {
    if (this.busy()) {
      return;
    }
    this.problem.set(null);
    this.busy.set('resync');
    this.api.resyncMeeting(this.sessionId()).subscribe({
      next: (summary) => {
        this.busy.set(null);
        this.toast.info(this.i18n.t('live.instructor.actions.resyncStarted'));
        this.meetingChange.emit(summary);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected connectGoogle(): void {
    if (this.busy()) {
      return;
    }
    this.problem.set(null);
    this.busy.set('connect');
    // On success the whole window navigates to Google, so `busy` is deliberately left set.
    this.googleConnect.start(this.returnPath()).subscribe({ error: (error: unknown) => this.fail(error) });
  }

  private fail(error: unknown): void {
    this.busy.set(null);
    this.problem.set(instructorProblemMessage(error));
  }
}
