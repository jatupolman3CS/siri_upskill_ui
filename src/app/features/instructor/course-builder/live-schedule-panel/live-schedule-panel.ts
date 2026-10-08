import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorPlus, phosphorWarning } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { SelectField, type SelectOption } from '../../../../shared/select/select';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { LiveInstructorApiService } from '../../../live/data/live-instructor-api.service';
import type { LiveSession } from '../../../live/data/live-instructor.models';
import { hasWaitingMeeting, instructorProblemMessage } from '../../../live/data/live-instructor.util';
import { LiveSubmitIssues } from '../../../live/data/live-submit-issues.service';
import type { DeliveryFormat } from '../../../live/data/live.models';
import { pollWhile } from '../../../live/instructor/poll-while';
import { CancelSessionDialog } from '../../../live/instructor/ui/cancel-session-dialog/cancel-session-dialog';
import { LiveGoogleSettings } from './live-google-settings';
import { LivePolicyForm } from './live-policy-form';
import { LiveSessionForm } from './live-session-form';
import { LiveSessionRow } from './live-session-row';

/** How often room status is re-checked — and only while at least one room is still being created. */
const MEETING_POLL_MS = 10_000;
const FORMATS: readonly DeliveryFormat[] = ['OnDemand', 'Live', 'Hybrid'];

/**
 * The course builder's "Live schedule" tab (FE-4): delivery format, the sessions with their room status and the action each
 * room needs, Google connection and attendee-sync controls, and enrollment deadline / seat cap. Mounted by the builder page
 * for a saved course; everything it shows comes from `live-schedule`, `meetings`, the instructor session list and Google
 * status — nothing is defaulted or invented.
 */
@Component({
  selector: 'app-live-schedule-panel',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    TranslatePipe,
    Button,
    EmptyState,
    SelectField,
    Skeleton,
    CancelSessionDialog,
    LiveGoogleSettings,
    LivePolicyForm,
    LiveSessionForm,
    LiveSessionRow,
  ],
  templateUrl: './live-schedule-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorPlus, phosphorWarning })],
  host: { class: 'block' },
})
export class LiveSchedulePanel {
  private readonly api = inject(LiveInstructorApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  protected readonly issues = inject(LiveSubmitIssues);

  readonly courseId = input.required<string>();

  private readonly scheduleResource = rxResource({
    params: () => this.courseId(),
    stream: ({ params }) => this.api.getLiveSchedule(params),
  });
  private readonly meetingsResource = rxResource({
    params: () => this.courseId(),
    stream: ({ params }) => this.api.getCourseMeetings(params),
  });
  /** Server-computed session states (the schedule response itself carries only the stored status). */
  private readonly statesResource = rxResource({
    params: () => this.courseId(),
    stream: ({ params }) => this.api.listSessions({ scope: 'all', courseId: params, page: 1, pageSize: 50 }),
  });
  private readonly googleResource = rxResource({ stream: () => this.api.getGoogleStatus() });

  protected readonly schedule = computed(() => (this.scheduleResource.hasValue() ? this.scheduleResource.value() : null));
  protected readonly isLoading = computed(() => this.scheduleResource.isLoading() && !this.scheduleResource.hasValue());
  protected readonly hasError = computed(() => !this.scheduleResource.hasValue() && this.scheduleResource.status() === 'error');
  private readonly meetings = computed(() => (this.meetingsResource.hasValue() ? this.meetingsResource.value().items : []));
  protected readonly googleStatus = computed(() => (this.googleResource.hasValue() ? this.googleResource.value() : null));

  protected readonly formatControl = new FormControl<DeliveryFormat>('OnDemand', { nonNullable: true });
  protected readonly changingFormat = signal(false);
  protected readonly isOnDemand = computed(() => (this.schedule()?.deliveryFormat ?? 'OnDemand') === 'OnDemand');
  protected readonly hasScheduledSessions = computed(() => (this.schedule()?.sessions ?? []).some((s) => s.status === 'Scheduled'));
  protected readonly formatOptions = computed<SelectOption[]>(() =>
    FORMATS.map((format) => ({
      value: format,
      label: this.i18n.t(`live.catalog.format.${format}`),
      // Going back to on-demand needs every scheduled session cancelled first (the server enforces the same).
      disabled: format === 'OnDemand' && this.hasScheduledSessions(),
    })),
  );

  /** `null` = form closed, `'new'` = adding, a session = editing it. */
  protected readonly editing = signal<LiveSession | 'new' | null>(null);
  protected readonly editingSession = computed(() => {
    const target = this.editing();
    return target === 'new' ? null : target;
  });
  protected readonly cancelTarget = signal<LiveSession | null>(null);
  protected readonly cancelOpen = signal(false);

  protected readonly rows = computed(() => {
    const meetings = new Map(this.meetings().map((meeting) => [meeting.sessionId, meeting]));
    const states = new Map(
      (this.statesResource.hasValue() ? this.statesResource.value().items : []).map((item) => [item.sessionId, item.displayState]),
    );
    const notReady = this.issues.notReadySessionIds();
    return (this.schedule()?.sessions ?? []).map((session) => {
      const meeting = meetings.get(session.id) ?? null;
      return {
        session,
        meeting,
        state: states.get(session.id) ?? null,
        highlighted: notReady.includes(session.id) && !meeting?.isUsable,
      };
    });
  });
  protected readonly roomsMissing = computed(
    () => this.rows().filter((row) => row.session.status === 'Scheduled' && row.state !== 'Ended' && row.meeting && !row.meeting.isUsable).length,
  );

  constructor() {
    effect(() => {
      const format = this.schedule()?.deliveryFormat;
      if (format) {
        untracked(() => this.formatControl.setValue(format, { emitEvent: false }));
      }
    });
    // Rooms are created in the background; check again every 10 s, and only while one is still "Waiting".
    pollWhile(() => hasWaitingMeeting(this.meetings()), () => this.meetingsResource.reload(), MEETING_POLL_MS);
  }

  protected reloadAll(): void {
    this.scheduleResource.reload();
    this.meetingsResource.reload();
    this.statesResource.reload();
  }

  protected retry(): void {
    this.reloadAll();
    this.googleResource.reload();
  }

  protected changeFormat(): void {
    const next = this.formatControl.value;
    if (this.changingFormat() || next === this.schedule()?.deliveryFormat) {
      return;
    }
    this.changingFormat.set(true);
    this.formatControl.disable({ emitEvent: false });
    this.api.setDeliveryFormat(this.courseId(), next).subscribe({
      next: () => {
        this.changingFormat.set(false);
        this.formatControl.enable({ emitEvent: false });
        this.toast.success(this.i18n.t('live.builder.format.saved'));
        this.reloadAll();
      },
      error: (error: unknown) => {
        this.changingFormat.set(false);
        this.formatControl.enable({ emitEvent: false });
        // Put the selector back on what the server still has.
        this.formatControl.setValue(this.schedule()?.deliveryFormat ?? 'OnDemand', { emitEvent: false });
        const message = instructorProblemMessage(error);
        this.toast.error(this.i18n.t(message.key, message.params));
      },
    });
  }

  protected onSessionSaved(): void {
    this.editing.set(null);
    this.reloadAll();
  }

  protected askCancel(session: LiveSession): void {
    this.cancelTarget.set(session);
    this.cancelOpen.set(true);
  }

  protected onAttendeeSync(): void {
    this.scheduleResource.reload();
  }
}
