import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCheckCircle,
  phosphorEnvelopeSimple,
  phosphorMinusCircle,
  phosphorVideoCamera,
  phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { LiveAdminStatus } from '../../live/data/live-admin.models';
import { durationView } from '../../live/data/live-admin.util';

type Tone = 'success' | 'warning' | 'danger';

const TONE_ICON: Record<Tone, string> = {
  success: 'phosphorCheckCircle',
  warning: 'phosphorMinusCircle',
  danger: 'phosphorWarningCircle',
};

const TONE_CLASS: Record<Tone, string> = {
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-warning)]',
  danger: 'text-[var(--color-danger)]',
};

/** How each e-mail provider is described, and whether that is good, merely degraded, or broken. */
const EMAIL_PROVIDER: Record<LiveAdminStatus['email']['provider'], Tone> = {
  Smtp: 'success',
  Log: 'warning',
  Unconfigured: 'danger',
};

const LIVE_PROVIDER: Record<LiveAdminStatus['live']['provider'], Tone> = {
  GoogleMeet: 'success',
  ManualOnly: 'warning',
  Logging: 'warning',
};

/** The e-mail outbox and Live-settings halves of the status page: counts the admin can act on, with icon + text per state. */
@Component({
  selector: 'app-live-status-services',
  imports: [NgIcon, TranslatePipe],
  templateUrl: './live-status-services.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({ phosphorCheckCircle, phosphorEnvelopeSimple, phosphorMinusCircle, phosphorVideoCamera, phosphorWarningCircle }),
  ],
  host: { class: 'grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-1' },
})
export class LiveStatusServices {
  readonly status = input.required<LiveAdminStatus>();

  protected readonly email = computed(() => this.status().email);
  protected readonly live = computed(() => this.status().live);

  protected readonly emailTone = computed(() => EMAIL_PROVIDER[this.email().provider]);
  protected readonly liveTone = computed(() => LIVE_PROVIDER[this.live().provider]);
  protected readonly oldestPending = computed(() => durationView(this.email().oldestPendingAgeSeconds));

  protected readonly iconFor = (tone: Tone): string => TONE_ICON[tone];
  protected readonly classFor = (tone: Tone): string => TONE_CLASS[tone];
}
