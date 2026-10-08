import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslationService } from '../../../../core/i18n/translation.service';
import type { IsoUtc } from '../../data/live.models';
import { countdownParts, msUntil } from '../live-clock';

/**
 * Ticking "time remaining" text for a session boundary. The remaining time is measured on the server-corrected clock
 * (`offsetMs`, see `live-clock.ts`) and the component emits {@link reached} exactly once per target when it hits zero,
 * so the parent can refetch/retry without polling.
 *
 * Accessibility: `role="timer"` is implicitly `aria-live="off"` and we set it explicitly — a countdown must never be
 * announced every second (appendix §F). The *moments* that matter (the room opening, the state changing) are announced
 * by the parent's single `role="status"` message instead.
 */
@Component({
  selector: 'app-live-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'timer', 'aria-live': 'off', class: 'tabular-nums' },
  template: `{{ text() }}`,
})
export class LiveCountdown {
  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly targetUtc = input.required<IsoUtc>();
  /** `serverNow - deviceNow` in ms (from `clockOffsetMs`). */
  readonly offsetMs = input(0);
  /** Fires once per distinct `targetUtc`, the first time the remaining time reaches zero. */
  readonly reached = output<void>();

  private readonly deviceNowMs = signal(Date.now());
  private firedFor: string | null = null;

  protected readonly remainingMs = computed(() => Math.max(0, msUntil(this.targetUtc(), this.offsetMs(), this.deviceNowMs()) ?? 0));

  protected readonly text = computed(() => {
    const { days, hours, minutes, seconds } = countdownParts(this.remainingMs());
    if (days > 0) {
      return this.translation.t('live.countdown.daysHours', { days, hours });
    }
    if (hours > 0) {
      return this.translation.t('live.countdown.hoursMinutes', { hours, minutes });
    }
    if (minutes > 0) {
      return this.translation.t('live.countdown.minutesSeconds', { minutes, seconds });
    }
    return this.translation.t('live.countdown.seconds', { seconds });
  });

  constructor() {
    afterNextRender(() => {
      this.tick();
      const handle = setInterval(() => this.tick(), 1000);
      this.destroyRef.onDestroy(() => clearInterval(handle));
    });
  }

  private tick(): void {
    const now = Date.now();
    this.deviceNowMs.set(now);
    const target = this.targetUtc();
    const remaining = msUntil(target, this.offsetMs(), now);
    // An unparseable target (null) never "arrives" — it must not trigger a refetch/retry loop.
    if (remaining !== null && remaining <= 0 && this.firedFor !== target) {
      this.firedFor = target;
      this.reached.emit();
    }
  }
}
