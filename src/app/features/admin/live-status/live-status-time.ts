import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { BangkokDatePipe } from '../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { relativeTime } from '../../live/data/live-admin.util';

/**
 * One instant on the Live status page: how long ago / how soon, measured against the SERVER's snapshot time, with the
 * absolute Asia/Bangkok time underneath. A missing instant (a job that never ran) reads as an em dash.
 */
@Component({
  selector: 'app-live-status-time',
  imports: [TranslatePipe, BangkokDatePipe],
  template: `
    @if (instant(); as iso) {
      @if (relative(); as rel) {
        <time [attr.datetime]="iso" class="block text-sm font-medium text-[var(--color-text)]">{{
          rel.key | translate: { count: rel.count }
        }}</time>
      }
      <span class="block text-xs text-[var(--color-text-muted)]">{{ iso | bangkokDate: 'shortDateTime' }}</span>
    } @else {
      <span class="text-sm text-[var(--color-text-muted)]" aria-hidden="true">—</span>
      <span class="sr-only">{{ 'admin.liveStatus.time.never' | translate }}</span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class LiveStatusTime {
  readonly instant = input<string | null>(null);
  /** The server's clock for this snapshot. */
  readonly nowUtc = input.required<string>();

  protected readonly relative = computed(() => relativeTime(this.instant(), this.nowUtc()));
}
