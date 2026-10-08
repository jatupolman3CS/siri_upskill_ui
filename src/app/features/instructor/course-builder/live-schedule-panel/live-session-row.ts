import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretRight, phosphorPencilSimple, phosphorWarning, phosphorXCircle } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import type { InstructorMeetingSummary, LiveSession } from '../../../live/data/live-instructor.models';
import { meetingStatusView } from '../../../live/data/live-instructor.util';
import type { LiveDisplayState } from '../../../live/data/live.models';
import { LiveStatusBadge } from '../../../live/learner/live-status-badge/live-status-badge';
import { MeetingActions } from '../../../live/instructor/ui/meeting-actions/meeting-actions';
import { RecordingUploader } from '../../../live/instructor/ui/recording-uploader/recording-uploader';
import { StatusChip } from '../../../live/instructor/ui/status-chip/status-chip';
import { BangkokTimeRange } from '../../../live/ui/bangkok-time-range/bangkok-time-range';

/**
 * One session in the builder's live schedule: its time, server-computed state, room status and the action the server says
 * the room needs (`needsAction`), plus edit / cancel, and — once it has ended — recording upload. A session the last
 * "submit for review" refused for having no room is outlined and explained.
 */
@Component({
  selector: 'app-live-session-row',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    Button,
    LiveStatusBadge,
    StatusChip,
    BangkokTimeRange,
    MeetingActions,
    RecordingUploader,
  ],
  templateUrl: './live-session-row.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretRight, phosphorPencilSimple, phosphorWarning, phosphorXCircle })],
  host: { class: 'block' },
})
export class LiveSessionRow {
  readonly session = input.required<LiveSession>();
  readonly courseId = input.required<string>();
  /** Server-computed (from the instructor session list). `null` until it has loaded — never derived from the clock here. */
  readonly displayState = input<LiveDisplayState | null>(null);
  readonly meeting = input<InstructorMeetingSummary | null>(null);
  readonly googleConfigured = input<boolean | null>(null);
  /** The last submit-for-review named this session as having no meeting room. */
  readonly highlighted = input(false);
  readonly editRequested = output<LiveSession>();
  readonly cancelRequested = output<LiveSession>();
  /** Something changed on the server (room link saved, resync, recording attached) — the panel refetches. */
  readonly changed = output<void>();

  protected readonly state = computed<LiveDisplayState | null>(() =>
    this.session().status === 'Cancelled' ? 'Cancelled' : this.displayState(),
  );
  protected readonly isCancelled = computed(() => this.state() === 'Cancelled');
  protected readonly isEnded = computed(() => this.state() === 'Ended');
  /** Edit / cancel are offered unless the server already says the session is over (it still re-checks on submit). */
  protected readonly canEdit = computed(() => !['Cancelled', 'Ended', 'Live'].includes(this.state() ?? ''));
  protected readonly canCancel = computed(() => !['Cancelled', 'Ended'].includes(this.state() ?? ''));
  protected readonly roomView = computed(() => {
    const meeting = this.meeting();
    return meeting ? meetingStatusView(meeting) : null;
  });
  protected readonly returnPath = computed(() => `/instructor/courses/${this.courseId()}/builder`);
}
