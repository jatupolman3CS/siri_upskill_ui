import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretRight, phosphorFilmStrip, phosphorUsers } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { LiveInstructorApiService } from '../../data/live-instructor-api.service';
import type { InstructorSessionScope } from '../../data/live-instructor.models';
import { meetingStatusView } from '../../data/live-instructor.util';
import { RECORDING_IMPORT_POLL_MS, hasInFlightRecordingImport, recordingListChip } from '../../data/live-recording-import.util';
import { BangkokTimeRange } from '../../ui/bangkok-time-range/bangkok-time-range';
import { pollWhile } from '../poll-while';
import { trackStudioMeta } from '../studio-meta';
import { LiveStatusBadge } from '../../learner/live-status-badge/live-status-badge';
import { StatusChip } from '../ui/status-chip/status-chip';

const PAGE_SIZE = 20;
const SCOPES: readonly InstructorSessionScope[] = ['upcoming', 'past', 'all'];

function toScope(value: string | null): InstructorSessionScope {
  return SCOPES.find((scope) => scope === value) ?? 'upcoming';
}

/**
 * `/instructor/sessions` — every live session of the signed-in instructor. The URL is the single source of truth for the
 * scope tab and the page (`?scope=past&page=2`), so Back and reload keep the view — same rule as the public catalog.
 */
@Component({
  selector: 'app-sessions-page',
  imports: [RouterLink, NgIcon, TranslatePipe, Button, EmptyState, Pagination, Skeleton, LiveStatusBadge, StatusChip, BangkokTimeRange],
  templateUrl: './sessions-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretRight, phosphorFilmStrip, phosphorUsers })],
})
export class SessionsPage {
  private readonly api = inject(LiveInstructorApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  protected readonly scopes = SCOPES;
  protected readonly scope = computed(() => toScope(this.queryParams().get('scope')));
  protected readonly page = computed(() => Math.max(1, Number(this.queryParams().get('page') ?? '1') || 1));

  private readonly sessionsResource = rxResource({
    params: () => ({ scope: this.scope(), page: this.page() }),
    stream: ({ params }) => this.api.listSessions({ scope: params.scope, page: params.page, pageSize: PAGE_SIZE }),
  });

  protected readonly result = computed(() => (this.sessionsResource.hasValue() ? this.sessionsResource.value() : null));
  protected readonly isLoading = computed(() => this.sessionsResource.isLoading() && !this.sessionsResource.hasValue());
  protected readonly hasError = computed(() => !this.sessionsResource.hasValue() && this.sessionsResource.status() === 'error');
  protected readonly skeletonRows = [0, 1, 2];

  /** Row view-models: the badge views are derived once per response, not per change-detection pass. */
  protected readonly rows = computed(() =>
    (this.result()?.items ?? []).map((item) => ({
      item,
      // A cancelled session has no room to report on.
      meeting: item.displayState === 'Cancelled' ? null : meetingStatusView(item.meeting),
      // Text only: the whole card is a link, so the retry / upload controls live on the session's own page.
      recording: recordingListChip(item.displayState, item.recordingEpisodeId, item.recordingImport),
    })),
  );

  constructor() {
    trackStudioMeta('live.instructor.sessions.pageTitle', 'live.instructor.sessions.pageDescription', () => '/instructor/sessions');
    // An automatic recording import moves on by itself; look again every 30 s, and only while one is in flight.
    pollWhile(
      () => hasInFlightRecordingImport(this.result()?.items ?? []),
      () => this.sessionsResource.reload(),
      RECORDING_IMPORT_POLL_MS,
    );
  }

  protected setScope(next: InstructorSessionScope): void {
    // Changing the scope starts again from page 1.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { scope: next === 'upcoming' ? null : next, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected goToPage(next: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: next === 1 ? null : next },
      queryParamsHandling: 'merge',
    });
  }

  protected retry(): void {
    this.sessionsResource.reload();
  }
}
