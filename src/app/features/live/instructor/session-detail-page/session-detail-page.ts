import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorFilmStrip,
  phosphorPlayCircle,
  phosphorProhibit,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { LiveInstructorApiService } from '../../data/live-instructor-api.service';
import { BangkokTimeRange } from '../../ui/bangkok-time-range/bangkok-time-range';
import { pollWhile } from '../poll-while';
import { trackStudioMeta } from '../studio-meta';
import { CancelSessionDialog } from '../ui/cancel-session-dialog/cancel-session-dialog';
import { RecordingUploader } from '../ui/recording-uploader/recording-uploader';
import { LiveStatusBadge } from '../../learner/live-status-badge/live-status-badge';
import { SessionRoomCard } from './session-room-card/session-room-card';
import { SessionRoster } from './session-roster/session-roster';

const POLL_INTERVAL_MS = 10_000;

/**
 * `/instructor/sessions/:id` — one live session as its owning instructor sees it: room status/link/actions, the headline
 * numbers, the roster, cancellation and the recording. `meetUrl` lives only in this component's resource (a signal) and is
 * dropped when the page is destroyed — never persisted. While the room is still being created the page re-checks it every
 * 10 s so the link appears without a manual refresh.
 */
@Component({
  selector: 'app-session-detail-page',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    BangkokTimeRange,
    Button,
    EmptyState,
    Skeleton,
    LiveStatusBadge,
    SessionRoomCard,
    SessionRoster,
    CancelSessionDialog,
    RecordingUploader,
  ],
  templateUrl: './session-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowLeft,
          phosphorFilmStrip,
      phosphorPlayCircle,
      phosphorProhibit,
      phosphorXCircle,
    }),
  ],
})
export class SessionDetailPage {
  private readonly api = inject(LiveInstructorApiService);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly sessionId = computed(() => this.params().get('id') ?? '');

  protected readonly detailResource = rxResource({
    params: () => this.sessionId() || undefined,
    stream: ({ params }) => this.api.getSessionDetail(params),
  });
  /** Only used to hide the "connect Google" button when the server has no OAuth client — a failure just leaves it visible. */
  private readonly googleResource = rxResource({ stream: () => this.api.getGoogleStatus() });

  protected readonly detail = computed(() => (this.detailResource.hasValue() ? this.detailResource.value() : null));
  protected readonly isLoading = computed(() => this.detailResource.isLoading() && !this.detailResource.hasValue());
  protected readonly googleConfigured = computed(() =>
    this.googleResource.hasValue() ? this.googleResource.value().configured : null,
  );

  /** 403/404 are shown identically — the API folds "not yours" and "does not exist" together on purpose. */
  protected readonly notFound = computed(() => {
    if (this.detailResource.hasValue() || this.detailResource.status() !== 'error') {
      return false;
    }
    const error = this.detailResource.error();
    return error instanceof ApiError && (error.status === 404 || error.status === 403);
  });
  protected readonly hasError = computed(
    () => !this.detailResource.hasValue() && this.detailResource.status() === 'error' && !this.notFound(),
  );

  protected readonly isCancelled = computed(() => this.detail()?.displayState === 'Cancelled');
  protected readonly canCancel = computed(() => ['Upcoming', 'Live'].includes(this.detail()?.displayState ?? ''));
  protected readonly isEnded = computed(() => this.detail()?.displayState === 'Ended');
  protected readonly cancelOpen = signal(false);

  constructor() {
    trackStudioMeta('live.instructor.detail.pageTitle', 'live.instructor.detail.pageDescription', () => `/instructor/sessions/${this.sessionId()}`);
    // The room is being created in the background — keep checking, but only while that is true.
    pollWhile(() => this.detail()?.meeting.needsAction === 'Waiting', () => this.reload(), POLL_INTERVAL_MS);
  }

  protected reload(): void {
    this.detailResource.reload();
  }
}
