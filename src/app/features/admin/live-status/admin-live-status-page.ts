import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowClockwise, phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Button } from '../../../shared/button/button';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { LiveAdminApiService } from '../../live/data/live-admin-api.service';
import type { LiveAdminStatus } from '../../live/data/live-admin.models';
import { pollWhile } from '../../live/instructor/poll-while';
import { trackStudioMeta } from '../../live/instructor/studio-meta';
import { LiveStatusJobs } from './live-status-jobs';
import { LiveStatusServices } from './live-status-services';
import { LiveStatusVerdict } from './live-status-verdict';

/** How often the page re-checks while the tab is visible. */
export const LIVE_STATUS_REFRESH_MS = 30_000;

/**
 * `/admin/live-status` — can the platform actually run live classes right now? One AdminOnly call
 * (`GET /api/live/admin/status`) answers it: a verdict first, then the job server, recurring jobs, e-mail outbox and Live
 * settings behind it. Refreshes itself every 30 s while the tab is visible (and not at all in a background tab); if a
 * refresh fails the last good snapshot stays on screen with a notice rather than blanking the page.
 */
@Component({
  selector: 'app-admin-live-status-page',
  imports: [
    NgIcon,
    TranslatePipe,
    BangkokDatePipe,
    Button,
    EmptyState,
    Skeleton,
    LiveStatusVerdict,
    LiveStatusJobs,
    LiveStatusServices,
  ],
  templateUrl: './admin-live-status-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowClockwise, phosphorWarningCircle })],
})
export class AdminLiveStatusPage {
  private readonly api = inject(LiveAdminApiService);
  private readonly document = inject(DOCUMENT);

  protected readonly statusResource = rxResource({ stream: () => this.api.getStatus() });

  /** The latest snapshot that loaded successfully — kept across a failed refresh. `.value()` is only read behind `hasValue()`. */
  protected readonly status = linkedSignal<LiveAdminStatus | undefined, LiveAdminStatus | null>({
    source: () => (this.statusResource.hasValue() ? this.statusResource.value() : undefined),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });

  /** No snapshot at all and the call failed. */
  protected readonly hasError = computed(() => this.statusResource.status() === 'error' && this.status() === null);
  /** First load: nothing to show yet and no failure either. */
  protected readonly isLoading = computed(() => this.status() === null && !this.hasError());
  protected readonly isRefreshing = computed(() => this.statusResource.isLoading() && this.status() !== null);
  /** A snapshot is showing but the latest refresh failed. */
  protected readonly isStale = computed(() => this.statusResource.status() === 'error' && this.status() !== null);

  constructor() {
    trackStudioMeta('admin.liveStatus.pageTitle', 'admin.liveStatus.pageDescription', () => '/admin/live-status');
    // Background tabs are skipped: nobody is looking, and it would only spend server time.
    pollWhile(
      () => true,
      () => {
        if (this.document.visibilityState === 'visible') {
          this.reload();
        }
      },
      LIVE_STATUS_REFRESH_MS,
    );
  }

  protected reload(): void {
    this.statusResource.reload();
  }
}
