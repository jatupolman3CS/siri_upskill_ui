import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { BangkokDatePipe } from '../../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../../shared/button/button';
import { EmptyState } from '../../../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../../../shared/skeleton/skeleton';
import type { ReportStatus } from '../../../data/admin-analytics.util';

let nextFrameId = 0;

/**
 * The frame every analytics report sits in: its heading, when the server produced the figures (they may come from a cache a few minutes old),
 * a "refresh" button, and the three states of anything that is fetched - a busy skeleton, an error with a way to try again, and the content
 * itself (projected). The content is only rendered when the report is `ready`; the frame never decides what an empty report looks like.
 */
@Component({
  selector: 'app-analytics-report-frame',
  imports: [TranslatePipe, BangkokDatePipe, Button, EmptyState, Skeleton],
  template: `
    <section class="glass-card flex min-w-0 flex-col gap-5 rounded-[var(--radius-lg)] p-5 sm:p-6" [attr.aria-labelledby]="headingId" [attr.aria-busy]="status() === 'loading'">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 [id]="headingId" class="text-lg font-semibold text-[var(--color-text)]">{{ headingKey() | translate }}</h2>
          @if (descriptionKey(); as key) {
            <p class="mt-1 max-w-3xl text-sm text-[var(--color-text-muted)]">{{ key | translate }}</p>
          }
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <p class="text-sm text-[var(--color-text-muted)]" aria-live="polite">
            @if (generatedAtUtc(); as generated) {
              {{ 'tutoring.admin.analytics.generatedAt' | translate: { when: (generated | bangkokDate: 'dateTime') } }}
            }
          </p>
          <app-button size="sm" variant="secondary" [loading]="status() === 'loading'" [disabled]="status() === 'loading'" (click)="refresh.emit()">
            {{ 'tutoring.admin.analytics.refresh' | translate }}
          </app-button>
        </div>
      </div>

      @switch (status()) {
        @case ('loading') {
          <div role="status" [attr.aria-label]="'tutoring.admin.common.loading' | translate" class="flex flex-col gap-3">
            <app-skeleton variant="block" height="5rem" radius="lg" />
            <app-skeleton variant="block" height="10rem" radius="lg" />
          </div>
        }
        @case ('error') {
          <app-empty-state [heading]="'tutoring.admin.analytics.errorHeading' | translate" [description]="errorText() ?? ''">
            <app-button emptyStateAction variant="secondary" (click)="refresh.emit()">{{ 'tutoring.admin.common.retry' | translate }}</app-button>
          </app-empty-state>
        }
        @default {
          <ng-content />
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class AnalyticsReportFrame {
  readonly headingKey = input.required<string>();
  readonly descriptionKey = input<string | null>(null);
  readonly status = input.required<ReportStatus>();
  /** Already-translated explanation shown with the retry action when `status` is `error`. */
  readonly errorText = input<string | null>(null);
  readonly generatedAtUtc = input<string | null>(null);
  readonly refresh = output<void>();

  protected readonly headingId = `analytics-report-${nextFrameId++}`;
}
