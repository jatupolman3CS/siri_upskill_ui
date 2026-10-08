import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCheckCircle,
  phosphorClock,
  phosphorHourglass,
  phosphorLockKey,
  phosphorProhibit,
  phosphorShieldWarning,
  phosphorVideoCamera,
  phosphorWarning,
} from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { setPageMeta } from '../../../../core/seo/page-meta';
import { Button } from '../../../../shared/button/button';
import { LiveLearnerApiService } from '../../data/live-learner-api.service';
import type { JoinLiveSessionResponse } from '../../data/live-learner.models';
import { BOUNDARY_SLACK_MS, MAX_TIMER_MS, msUntil } from '../live-clock';
import { LiveCountdown } from '../live-countdown/live-countdown';
import { LiveRefundNotice } from '../live-refund-notice/live-refund-notice';
import {
  type JoinState,
  NOT_OPEN_FALLBACK_RETRY_MS,
  REDIRECT_DELAY_MS,
  ROOM_RETRY_INTERVAL_MS,
  ROOM_RETRY_MAX_ATTEMPTS,
  isSafeRoomUrl,
  isSessionId,
  joinFailureOf,
} from './live-join-state';
import { JOIN_VIEWS, isEnteringState } from './live-join-view';
import { RoomRedirector } from './room-redirector';

/**
 * `/live/:sessionId/join` — the hand-off from the platform to the live room (appendix §F, FE-1; contract `P11-05`).
 *
 * The room link is a capability, so this page treats it that way:
 * - the join call is made exactly once, from `afterNextRender()` (browser only, never SSR/prefetch/ctor/effect), and
 *   again only for an explicit retry state or a learner's own click — each call is a logged "link revealed" event;
 * - the link lives in the {@link meetUrl} signal alone and is cleared on destroy — never in storage, router state, the
 *   URL, a log line or analytics — and there is deliberately no "copy link" button;
 * - the server decides everything (entitlement, window, room readiness); this page only renders the answer.
 */
@Component({
  selector: 'app-live-join-page',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, LiveCountdown, LiveRefundNotice],
  templateUrl: './live-join-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCheckCircle,
      phosphorClock,
      phosphorHourglass,
      phosphorLockKey,
      phosphorProhibit,
      phosphorShieldWarning,
      phosphorVideoCamera,
      phosphorWarning,
    }),
  ],
})
export class LiveJoinPage {
  private readonly api = inject(LiveLearnerApiService);
  private readonly router = inject(Router);
  private readonly redirector = inject(RoomRedirector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionId = inject(ActivatedRoute).snapshot.paramMap.get('sessionId') ?? '';

  protected readonly state = signal<JoinState>({ kind: 'checking' });
  /** The room link. Held here only, for the lifetime of this component, and cleared on destroy. */
  protected readonly meetUrl = signal<string | null>(null);

  protected readonly view = computed(() => JOIN_VIEWS[this.state().kind]);
  protected readonly isEntering = computed(() => isEnteringState(this.state().kind));
  protected readonly retryable = computed(() => {
    const state = this.state();
    return state.kind === 'error' || state.kind === 'rateLimited' || (state.kind === 'roomNotReady' && state.exhausted);
  });
  protected readonly maxAttempts = ROOM_RETRY_MAX_ATTEMPTS;

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly kind = computed(() => this.state().kind);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private roomAttempts = 0;

  constructor() {
    const translation = inject(TranslationService);
    setPageMeta({
      title: `${translation.t('live.join.pageTitle')} · ${translation.t('common.appName')}`,
      description: translation.t('live.join.pageDescription'),
      robots: 'noindex',
    });

    // The one initial join call. `afterNextRender` runs in the browser only, once.
    afterNextRender(() => this.start());

    // Move focus to the heading whenever the screen changes (not on first paint — the layout already handled that).
    let firstRun = true;
    afterRenderEffect(() => {
      this.kind();
      if (firstRun) {
        firstRun = false;
        return;
      }
      this.heading()?.nativeElement.focus({ preventScroll: true });
    });

    this.destroyRef.onDestroy(() => {
      this.clearTimer();
      this.meetUrl.set(null);
    });
  }

  protected retry(): void {
    this.roomAttempts = 0;
    this.state.set({ kind: 'checking' });
    this.requestJoin();
  }

  /** The learner chose the fallback link themselves, so the automatic redirect must not also fire. */
  protected cancelAutoRedirect(): void {
    this.clearTimer();
  }

  private start(): void {
    if (!isSessionId(this.sessionId)) {
      this.state.set({ kind: 'notFoundOrNoAccess' });
      return;
    }
    this.requestJoin();
  }

  private requestJoin(): void {
    if (this.inFlight) {
      return;
    }
    this.clearTimer();
    this.inFlight = true;
    this.api
      .joinSession(this.sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.inFlight = false;
          this.onJoined(response);
        },
        error: (error: unknown) => {
          this.inFlight = false;
          this.onFailed(error);
        },
      });
  }

  private onJoined(response: JoinLiveSessionResponse): void {
    if (!isSafeRoomUrl(response.meetUrl)) {
      this.state.set({ kind: 'error' });
      return;
    }
    this.meetUrl.set(response.meetUrl);
    this.state.set({ kind: 'redirecting' });
    this.timer = setTimeout(() => {
      const url = this.meetUrl();
      if (url !== null) {
        this.redirector.go(url);
      }
    }, REDIRECT_DELAY_MS);
  }

  private onFailed(error: unknown): void {
    const failure = joinFailureOf(error);
    switch (failure.kind) {
      case 'unauthenticated':
        void this.router.navigate(['/login'], { queryParams: { returnUrl: `/live/${this.sessionId}/join` } });
        return;
      case 'roomNotReady': {
        this.roomAttempts += 1;
        const exhausted = this.roomAttempts >= ROOM_RETRY_MAX_ATTEMPTS;
        this.state.set({ kind: 'roomNotReady', attempt: this.roomAttempts, exhausted });
        if (!exhausted) {
          this.scheduleRetry(ROOM_RETRY_INTERVAL_MS);
        }
        return;
      }
      case 'notOpen': {
        this.state.set(failure);
        // Come back by ourselves once the window opens; if the server still disagrees, back off instead of hammering it.
        const remaining = failure.opensAtUtc ? msUntil(failure.opensAtUtc, failure.offsetMs) : null;
        this.scheduleRetry(remaining !== null && remaining > 0 ? remaining + BOUNDARY_SLACK_MS : NOT_OPEN_FALLBACK_RETRY_MS);
        return;
      }
      default:
        this.state.set(failure);
    }
  }

  private scheduleRetry(delayMs: number): void {
    this.clearTimer();
    if (delayMs > MAX_TIMER_MS) {
      return;
    }
    this.timer = setTimeout(() => this.requestJoin(), delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
