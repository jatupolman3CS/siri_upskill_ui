import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowSquareOut, phosphorArrowsClockwise, phosphorLinkSimple, phosphorPlugs, phosphorVideoCamera } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { InputField } from '../../../../../shared/input/input';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { Spinner } from '../../../../../shared/spinner/spinner';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { GoogleConnectService } from '../../../../live/data/google-connect.service';
import { ALLOWED_MEETING_HOSTS } from '../../../../live/data/live-instructor.util';
import { pollWhile } from '../../../../live/instructor/poll-while';
import { StatusChip } from '../../../../live/instructor/ui/status-chip/status-chip';
import { roomErrorKey, roomStatusView } from '../../../data/tutor-class-view.util';
import type { Guid, RoomStatusDto } from '../../../data/tutoring-classes.models';
import { TutoringClassesApiService } from '../../../data/tutoring-classes-api.service';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';
import { meetingLinkIssue } from '../../tutor-class-form.util';

const POLL_INTERVAL_MS = 10_000;
/** Google's own "create an instant meeting" page - opened in a new tab so the tutor keeps this one. */
const NEW_MEET_URL = 'https://meet.google.com/new';

type Busy = 'link' | 'retry' | 'connect' | null;

/**
 * The room of one class as the tutor manages it (P13-25). What to do is chosen ONLY from the server's `needsAction`
 * (`PasteLink`, `ReconnectGoogle`, `Retry`, `Waiting`); the UI never re-derives it from `state`. The room link itself is never
 * shown here - the API does not return it from these endpoints; it is only handed out by "Start class". When Google is not
 * connected the card explains why the room is missing, offers the Google connection (the existing Live settings page and the
 * one-click reconnect) and, as the fallback, a manual link: create a Meet, paste its address. While the room is being created
 * the card re-checks it every ten seconds, and only then.
 */
@Component({
  selector: 'app-class-room-card',
  imports: [ReactiveFormsModule, RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, InputField, Skeleton, Spinner, StatusChip, TutorProblem],
  templateUrl: './class-room-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowSquareOut, phosphorArrowsClockwise, phosphorLinkSimple, phosphorPlugs, phosphorVideoCamera })],
  host: { class: 'block' },
})
export class ClassRoomCard {
  private readonly api = inject(TutoringClassesApiService);
  private readonly googleConnect = inject(GoogleConnectService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(TranslationService);

  readonly sessionId = input.required<Guid>();
  /** Bumped by the page when something may have changed the room (e.g. a refused "Start class"), so the card looks again. */
  readonly refresh = input(0);

  protected readonly newMeetUrl = NEW_MEET_URL;
  protected readonly allowedHosts = ALLOWED_MEETING_HOSTS;

  private readonly roomResource = rxResource({
    params: () => ({ id: this.sessionId(), refresh: this.refresh() }),
    stream: ({ params }) => this.api.getRoom(params.id),
  });
  protected readonly room = computed<RoomStatusDto | null>(() => (this.roomResource.hasValue() ? this.roomResource.value() : null));
  protected readonly isLoading = computed(() => this.roomResource.isLoading() && !this.roomResource.hasValue());
  protected readonly hasError = computed(() => this.roomResource.status() === 'error' && !this.roomResource.hasValue());
  protected readonly view = computed(() => {
    const room = this.room();
    return room === null ? null : roomStatusView(room);
  });
  protected readonly needsAction = computed(() => this.room()?.needsAction ?? 'None');
  protected readonly errorHint = computed(() => roomErrorKey(this.room()?.errorCode ?? null));

  protected readonly linkControl = new FormControl('', { nonNullable: true });
  protected readonly linkError = signal<string | null>(null);
  private readonly pasteRequested = signal(false);
  protected readonly busy = signal<Busy>(null);
  protected readonly problem = signal<string | null>(null);

  /** Paste is the main action for `PasteLink`, and an opt-in alternative while reconnecting / after a failure. */
  protected readonly showPaste = computed(() => this.needsAction() === 'PasteLink' || this.pasteRequested());
  protected readonly canOfferPaste = computed(() => this.needsAction() === 'ReconnectGoogle' || this.needsAction() === 'Retry');
  protected readonly returnPath = computed(() => `/instructor/tutoring/classes/${this.sessionId()}`);

  constructor() {
    pollWhile(() => this.needsAction() === 'Waiting', () => this.roomResource.reload(), POLL_INTERVAL_MS);
  }

  protected reload(): void {
    this.roomResource.reload();
  }

  protected togglePaste(): void {
    this.pasteRequested.update((value) => !value);
    this.linkError.set(null);
  }

  protected submitLink(event: Event): void {
    // A native <form> without NgForm: stop the browser's own submit (a full page reload) ourselves.
    event.preventDefault();
    this.saveLink();
  }

  protected saveLink(): void {
    if (this.busy() !== null) {
      return;
    }
    const issue = meetingLinkIssue(this.linkControl.value);
    if (issue) {
      this.linkError.set(this.i18n.t(issue.key, { hosts: ALLOWED_MEETING_HOSTS }));
      return;
    }
    this.linkError.set(null);
    this.problem.set(null);
    this.busy.set('link');
    this.api.setMeetingLink(this.sessionId(), this.linkControl.value.trim()).subscribe({
      next: () => {
        // The saved address is never echoed back and the field is cleared, so the link does not linger on screen.
        this.linkControl.reset('');
        this.pasteRequested.set(false);
        this.busy.set(null);
        this.toast.success(this.i18n.t('tutoring.tutor.classes.room.linkSaved'));
        this.roomResource.reload();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected retry(): void {
    if (this.busy() !== null) {
      return;
    }
    this.problem.set(null);
    this.busy.set('retry');
    this.api.retryRoom(this.sessionId()).subscribe({
      next: () => {
        this.busy.set(null);
        this.toast.info(this.i18n.t('tutoring.tutor.classes.room.retryStarted'));
        this.roomResource.reload();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected connectGoogle(): void {
    if (this.busy() !== null) {
      return;
    }
    this.problem.set(null);
    this.busy.set('connect');
    // On success the whole window navigates to Google, so `busy` is deliberately left set.
    this.googleConnect.start(this.returnPath()).subscribe({ error: (error: unknown) => this.fail(error) });
  }

  private fail(error: unknown): void {
    this.busy.set(null);
    this.problem.set(this.i18n.t(tutoringErrorKey(error)));
  }
}
