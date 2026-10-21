import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowLeft, phosphorProhibit, phosphorShieldWarning } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { pollWhile } from '../../../live/instructor/poll-while';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { StatusChip } from '../../../live/instructor/ui/status-chip/status-chip';
import { BangkokTimeRange } from '../../../live/ui/bangkok-time-range/bangkok-time-range';
import { isKnownSessionStatus, isOpenSessionStatus, sessionStatusView } from '../../data/tutor-class-view.util';
import { TutoringClassesApiService } from '../../data/tutoring-classes-api.service';
import { gradeLabelKey } from '../../data/tutoring-labels';
import { bookingStatusKeyOf } from '../../data/tutoring-tutor-labels';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { ClassCancelDialog } from './class-cancel-dialog/class-cancel-dialog';
import { ClassMaterialsCard } from './class-materials-card/class-materials-card';
import { ClassRoomCard } from './class-room-card/class-room-card';
import { ClassStartCard } from './class-start-card/class-start-card';
import { ClassSummaryCard } from './class-summary-card/class-summary-card';
import { TutorOpenDisputeDialog } from '../ui/tutor-open-dispute-dialog/tutor-open-dispute-dialog';

/** How often a class that is still open is looked at again (a learner joining shows up without a refresh). */
const POLL_INTERVAL_MS = 30_000;

/**
 * `/instructor/tutoring/classes/:sessionId` - one class as its tutor runs it (P13-25). It is also the address the calendar
 * invitation and the reminder e-mails point the tutor to ("start the class from the platform"). From the top: who is booked
 * (nickname and grade only), "Start class" - the primary way into the room - the room status, completing the class with the
 * lesson summary, the materials, and cancelling.
 * <para>
 * Cancelling is deliberately NOT behind the verified-tutor check: it is open to a tutor who is suspended right now (`403` on the
 * attendance call is the signal), and then the page shrinks to the explanation and the cancel action - everything else needs a
 * verified tutor on the server. A class that is missing or belongs to someone else answers the same `404`.
 * </para>
 */
@Component({
  selector: 'app-tutor-class-page',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    BangkokDatePipe,
    Button,
    EmptyState,
    Skeleton,
    StatusChip,
    BangkokTimeRange,
    TutorPortalNav,
    ClassStartCard,
    ClassRoomCard,
    ClassSummaryCard,
    ClassMaterialsCard,
    ClassCancelDialog,
    TutorOpenDisputeDialog,
  ],
  templateUrl: './tutor-class-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowLeft, phosphorProhibit, phosphorShieldWarning })],
})
export class TutorClassPage {
  private readonly api = inject(TutoringClassesApiService);
  protected readonly selectedDisputeBookingId = signal<string | null>(null);
  protected readonly disputeDialogOpen = signal(false);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly sessionId = computed(() => this.params().get('sessionId') ?? '');

  private readonly attendanceResource = rxResource({
    params: () => this.sessionId() || undefined,
    stream: ({ params }) => this.api.getAttendance(params),
  });
  protected readonly attendance = computed(() => (this.attendanceResource.hasValue() ? this.attendanceResource.value() : null));
  protected readonly isLoading = computed(() => this.attendanceResource.isLoading() && !this.attendanceResource.hasValue());

  private readonly failureStatus = computed(() => {
    if (this.attendanceResource.hasValue() || this.attendanceResource.status() !== 'error') {
      return null;
    }
    const error = this.attendanceResource.error();
    return error instanceof ApiError ? error.status : 0;
  });
  /** The class is missing or not this tutor's - the API says the same for both. */
  protected readonly notFound = computed(() => this.failureStatus() === 404);
  /** The attendance call is `TutorOnly`; a `403` means the tutor is not verified right now (e.g. suspended) - cancelling still works. */
  protected readonly restricted = computed(() => this.failureStatus() === 403);
  protected readonly hasError = computed(() => this.failureStatus() !== null && !this.notFound() && !this.restricted());

  protected readonly status = computed(() => this.attendance()?.status ?? '');
  protected readonly statusView = computed(() => {
    const status = this.status();
    return isKnownSessionStatus(status) ? sessionStatusView(status) : null;
  });
  protected readonly isOpen = computed(() => isOpenSessionStatus(this.status()));
  protected readonly isScheduled = computed(() => this.status() === 'Scheduled');
  protected readonly canSummarise = computed(() => this.status() === 'Scheduled' || this.status() === 'Completed');
  protected readonly isCancelled = computed(() => this.status() === 'Cancelled');

  protected readonly cancelOpen = signal(false);
  /** Bumped when a refused "Start class" suggests the room needs attention, so the room card looks again. */
  protected readonly roomRefresh = signal(0);

  protected readonly gradeKey = gradeLabelKey;
  protected readonly bookingStatusKey = bookingStatusKeyOf;

  constructor() {
    trackStudioMeta('tutoring.tutor.classes.detail.pageTitle', 'tutoring.tutor.classes.detail.pageDescription', () => `/instructor/tutoring/classes/${this.sessionId()}`);
    // Look again while the class is still open - and only then.
    pollWhile(() => this.isScheduled(), () => this.reload(), POLL_INTERVAL_MS);
  }

  protected reload(): void {
    this.attendanceResource.reload();
  }

  protected onRoomBlocked(): void {
    this.roomRefresh.update((value) => value + 1);
  }

  protected openDisputeFor(bookingId: string): void {
    this.selectedDisputeBookingId.set(bookingId);
    this.disputeDialogOpen.set(true);
  }
}
