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

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { setPageMeta } from '../../../../core/seo/page-meta';
import { Button } from '../../../../shared/button/button';
import { BOUNDARY_SLACK_MS, MAX_TIMER_MS, clockOffsetMs, msUntil } from '../../../live/learner/live-clock';
import { LiveCountdown } from '../../../live/learner/live-countdown/live-countdown';
import type { JoinTutoringSessionResponse } from '../../data/tutoring-classes.models';
import { TutoringSessionApiService } from '../../data/tutoring-session-api.service';
import { RoomOpener } from './room-opener';
import { TutorPresenceCheck } from './tutor-presence-check/tutor-presence-check';
import {
  NOT_OPEN_FALLBACK_RETRY_MS,
  ROOM_RETRY_INTERVAL_MS,
  ROOM_RETRY_MAX_ATTEMPTS,
  type TutoringJoinState,
  isSafeRoomUrl,
  isSessionId,
  tutorClassRoute,
  tutorMustActOnRoom,
  tutoringJoinFailureOf,
} from './tutoring-join-state';
import { TUTORING_JOIN_ICONS, TUTORING_JOIN_VIEWS } from './tutoring-join-view';

/**
 * `/tutoring/sessions/:sessionId/join` (P13-23; contract `P13-10` appendix) - the hand-off to the Meet room of a tutoring class,
 * for the learner and for the tutor (every link in the e-mails and calendar invites points here). Mirrors the live-class join page:
 * - the join call is made once, from `afterNextRender()` (browser only - never SSR, prefetch, constructor or effect), and again
 *   only for a retry state or the person's own click: each call is a logged "link revealed" event;
 * - the room link lives in the {@link meetUrl} signal alone and is cleared on destroy - never storage, router state, the URL, a log
 *   or analytics - and there is deliberately no "copy link" button;
 * - the server decides everything (who, which window, whether the room is ready); the page only renders the answer.
 * On success the page stays (the learner still has the "is the tutor here?" question) and tries to open the room in a new tab.
 */
@Component({
  selector: 'app-tutoring-join-page',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, LiveCountdown, TutorPresenceCheck],
  templateUrl: './tutoring-join-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons(TUTORING_JOIN_ICONS)],
})
export class TutoringJoinPage {
  private readonly api = inject(TutoringSessionApiService);
  private readonly router = inject(Router);
  private readonly opener = inject(RoomOpener);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly sessionId = inject(ActivatedRoute).snapshot.paramMap.get('sessionId') ?? '';

  protected readonly state = signal<TutoringJoinState>({ kind: 'checking' });
  /** The room link. Held here only, for the lifetime of this component, and cleared on destroy. */
  protected readonly meetUrl = signal<string | null>(null);

  protected readonly view = computed(() => TUTORING_JOIN_VIEWS[this.state().kind]);
  protected readonly retryable = computed(() => {
    const state = this.state();
    return state.kind === 'error' || state.kind === 'rateLimited' || (state.kind === 'roomNotReady' && state.exhausted);
  });
  protected readonly entering = computed(() => ['checking', 'notOpen', 'roomNotReady'].includes(this.state().kind));
  protected readonly maxAttempts = ROOM_RETRY_MAX_ATTEMPTS;
  protected readonly tutorClassLink = tutorClassRoute(this.sessionId);
  protected readonly tutorMustAct = computed(() => {
    const state = this.state();
    return state.kind === 'roomNotReady' && tutorMustActOnRoom(state.needsAction);
  });

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly kind = computed(() => this.state().kind);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private roomAttempts = 0;

  constructor() {
    const i18n = inject(TranslationService);
    setPageMeta({
      title: `${i18n.t('tutoring.join.pageTitle')} | ${i18n.t('common.appName')}`,
      description: i18n.t('tutoring.join.pageDescription'),
      robots: 'noindex',
    });

    // The one initial join call. `afterNextRender` runs in the browser only, once.
    afterNextRender(() => this.start());

    // Move focus to the heading whenever the screen changes (not on first paint - the layout already handled that).
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

  private onJoined(response: JoinTutoringSessionResponse): void {
    if (!isSafeRoomUrl(response.meetUrl)) {
      this.state.set({ kind: 'error' });
      return;
    }
    this.meetUrl.set(response.meetUrl);
    this.state.set({ kind: 'ready', role: response.role, startsAtUtc: response.startsAtUtc, offsetMs: clockOffsetMs(response.serverTimeUtc) });
    this.opener.open(response.meetUrl);
  }

  private onFailed(error: unknown): void {
    const failure = tutoringJoinFailureOf(error);
    switch (failure.kind) {
      case 'unauthenticated':
        void this.router.navigate(['/login'], { queryParams: { returnUrl: `/tutoring/sessions/${this.sessionId}/join` } });
        return;
      case 'roomNotReady': {
        this.roomAttempts += 1;
        const exhausted = this.roomAttempts >= ROOM_RETRY_MAX_ATTEMPTS;
        this.state.set({ kind: 'roomNotReady', attempt: this.roomAttempts, exhausted, needsAction: failure.needsAction });
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
