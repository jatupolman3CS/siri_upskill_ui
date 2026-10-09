import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCheckCircle,
  phosphorHardDrives,
  phosphorMinusCircle,
  phosphorWarningCircle,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { LiveAdminStatus } from '../../live/data/live-admin.models';
import { jobStateTone } from '../../live/data/live-admin.util';
import { LiveStatusTime } from './live-status-time';

const TONE_ICON = {
  success: 'phosphorCheckCircle',
  danger: 'phosphorWarningCircle',
  neutral: 'phosphorMinusCircle',
} as const;

const TONE_CLASS = {
  success: 'text-[var(--color-success)]',
  danger: 'text-[var(--color-danger)]',
  neutral: 'text-[var(--color-text-muted)]',
} as const;

/** The background-job half of the Live status page: is a job server alive, and are the recurring jobs actually running? */
@Component({
  selector: 'app-live-status-jobs',
  imports: [NgIcon, TranslatePipe, LiveStatusTime],
  templateUrl: './live-status-jobs.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({ phosphorCheckCircle, phosphorHardDrives, phosphorMinusCircle, phosphorWarningCircle, phosphorXCircle }),
  ],
  host: { class: 'flex flex-col gap-6' },
})
export class LiveStatusJobs {
  readonly status = input.required<LiveAdminStatus>();

  protected readonly nowUtc = computed(() => this.status().serverTimeUtc);
  protected readonly jobServer = computed(() => this.status().jobServer);
  protected readonly jobs = computed(() =>
    this.status().recurringJobs.map((job) => {
      const tone = jobStateTone(job.lastJobState);
      return { ...job, icon: TONE_ICON[tone], toneClass: TONE_CLASS[tone] };
    }),
  );
}
