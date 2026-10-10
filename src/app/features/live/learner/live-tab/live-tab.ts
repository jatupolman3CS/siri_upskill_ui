import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowClockwise, phosphorWarning } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { ApiError } from '../../../../core/http/error.interceptor';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import type { MySessionItem, MySessionsResponse } from '../../data/live-learner.models';
import { LiveLearnerApiService } from '../../data/live-learner-api.service';
import type { Guid } from '../../data/live.models';
import { LearnerMaterialsList } from '../../../catalog/ui/learner-materials-list/learner-materials-list';
import { clockOffsetMs, nextBoundaryDelayMs } from '../live-clock';
import { LiveRefundNotice } from '../live-refund-notice/live-refund-notice';
import { LiveSessionCard } from '../live-session-card/live-session-card';
import { saveBlob } from '../save-blob';

type TabStatus = 'loading' | 'ready' | 'error' | 'unavailable';

/**
 * The classroom's "Live" tab (appendix §F, FE-2): this learner's sessions for one course, read from
 * `GET /live/courses/{id}/my-sessions`.
 *
 * Everything shown comes from the server. The tab never works out `displayState`/`canJoin` itself; instead it asks the
 * server again at exactly the moments those can change (join window opens, session starts, session ends — see
 * `nextBoundaryDelayMs`), using the server-corrected clock. A `404` means "no active enrollment": the tab reports
 * {@link unavailable} and the parent hides it quietly rather than raising an error.
 */
@Component({
  selector: 'app-live-tab',
  imports: [NgIcon, TranslatePipe, Button, EmptyState, Skeleton, LiveSessionCard, LiveRefundNotice, LearnerMaterialsList],
  templateUrl: './live-tab.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowClockwise, phosphorWarning })],
})
export class LiveTab {
  private readonly api = inject(LiveLearnerApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly courseId = input.required<Guid>();
  readonly courseSlug = input.required<string>();
  /** The learner has no active enrollment in this course (`404`): the parent should hide the tab. */
  readonly unavailable = output<void>();

  protected readonly status = signal<TabStatus>('loading');
  protected readonly data = signal<MySessionsResponse | null>(null);
  /** A background refetch failed but the last good data is still on screen. */
  protected readonly refreshFailed = signal(false);
  protected readonly offsetMs = signal(0);
  protected readonly calendarBusyId = signal<Guid | null>(null);
  protected readonly skeletonSlots = [1, 2];

  private requestVersion = 0;

  /** Sessions still ahead of (or in) their join window, in the server's order. */
  protected readonly upcoming = computed<readonly MySessionItem[]>(() =>
    (this.data()?.sessions ?? []).filter((s) => s.displayState === 'Upcoming' || s.displayState === 'Live'),
  );
  protected readonly past = computed<readonly MySessionItem[]>(() =>
    (this.data()?.sessions ?? []).filter((s) => s.displayState === 'Ended' || s.displayState === 'Cancelled'),
  );

  constructor() {
    effect(() => {
      const courseId = this.courseId();
      untracked(() => this.load(courseId, false));
    });

    // Ask the server again exactly when its answer can change. Re-armed every time fresh data arrives.
    effect((onCleanup) => {
      const data = this.data();
      if (!data || !this.isBrowser) {
        return;
      }
      const delay = nextBoundaryDelayMs(data.sessions, this.offsetMs());
      if (delay === null) {
        return;
      }
      const handle = setTimeout(() => this.load(untracked(this.courseId), true), delay);
      onCleanup(() => clearTimeout(handle));
    });
  }

  protected reload(): void {
    this.load(this.courseId(), false);
  }

  protected join(sessionId: Guid): void {
    void this.router.navigate(['/live', sessionId, 'join']);
  }

  protected addToCalendar(sessionId: Guid): void {
    if (this.calendarBusyId() !== null) {
      return;
    }
    this.calendarBusyId.set(sessionId);
    this.api
      .downloadCalendar(sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(this.document, blob, `live-${sessionId}.ics`);
          this.calendarBusyId.set(null);
        },
        error: (error: unknown) => {
          this.calendarBusyId.set(null);
          // The error body of a blob response is unreadable, so the HTTP status alone picks the message.
          const gone = error instanceof ApiError && (error.status === 404 || error.status === 409);
          this.toast.error(this.translation.t(gone ? 'live.tab.calendarUnavailable' : 'live.tab.calendarError'));
        },
      });
  }

  /** `background` refetches keep the current list on screen instead of flashing the skeleton. */
  private load(courseId: Guid, background: boolean): void {
    const version = ++this.requestVersion;
    if (!background) {
      this.status.set('loading');
      this.data.set(null);
      this.refreshFailed.set(false);
    }

    this.api
      .getMySessions(courseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (version !== this.requestVersion) {
            return;
          }
          this.offsetMs.set(clockOffsetMs(response.serverTimeUtc));
          this.data.set(response);
          this.refreshFailed.set(false);
          this.status.set('ready');
        },
        error: (error: unknown) => {
          if (version !== this.requestVersion) {
            return;
          }
          if (error instanceof ApiError && error.status === 404) {
            this.status.set('unavailable');
            this.unavailable.emit();
            return;
          }
          if (background && this.data() !== null) {
            this.refreshFailed.set(true);
            return;
          }
          this.status.set('error');
        },
      });
  }
}
