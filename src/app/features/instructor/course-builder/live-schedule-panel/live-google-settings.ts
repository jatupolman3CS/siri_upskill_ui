import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorInfo, phosphorPlugs, phosphorWarning } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { ToastService } from '../../../../shared/toast/toast.service';
import { GoogleConnectService } from '../../../live/data/google-connect.service';
import { LiveInstructorApiService } from '../../../live/data/live-instructor-api.service';
import type { GoogleConnectionStatus } from '../../../live/data/live-instructor.models';
import { instructorProblemMessage } from '../../../live/data/live-instructor.util';

/**
 * Google-related controls of the live schedule: the "connect Google Calendar" banner, the fixed note about Google's own plan
 * limits (they depend on the instructor's Google account, not on this platform), and the per-course switch that lets the
 * platform send learners' emails to Google so they are invited into the calendar event.
 */
@Component({
  selector: 'app-live-google-settings',
  imports: [NgIcon, TranslatePipe, Button],
  templateUrl: './live-google-settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorInfo, phosphorPlugs, phosphorWarning })],
  host: { class: 'flex flex-col gap-3' },
})
export class LiveGoogleSettings {
  private readonly api = inject(LiveInstructorApiService);
  private readonly googleConnect = inject(GoogleConnectService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly courseId = input.required<string>();
  /** `null` while the status is loading or unavailable. */
  readonly status = input<GoogleConnectionStatus | null>(null);
  readonly attendeeSyncEnabled = input(false);
  readonly attendeeSyncChange = output<boolean>();

  protected readonly connecting = signal(false);
  protected readonly savingSync = signal(false);

  protected readonly showConnect = computed(() => {
    const status = this.status();
    return status !== null && status.configured && !status.connected;
  });
  protected readonly needsReconnect = computed(() => this.status()?.needsReconnect === true);
  protected readonly manualOnly = computed(() => this.status()?.configured === false);

  protected connect(): void {
    if (this.connecting()) {
      return;
    }
    this.connecting.set(true);
    // Google's consent screen takes over the whole window; the instructor lands back on this builder afterwards.
    this.googleConnect.start(`/instructor/courses/${this.courseId()}/builder`).subscribe({
      error: (error: unknown) => {
        this.connecting.set(false);
        const message = instructorProblemMessage(error);
        this.toast.error(this.i18n.t(message.key, message.params));
      },
    });
  }

  protected toggleSync(): void {
    if (this.savingSync()) {
      return;
    }
    const next = !this.attendeeSyncEnabled();
    this.savingSync.set(true);
    this.api.setLiveSettings(this.courseId(), next).subscribe({
      next: (result) => {
        this.savingSync.set(false);
        this.attendeeSyncChange.emit(result.googleAttendeeSyncEnabled);
      },
      error: (error: unknown) => {
        this.savingSync.set(false);
        const message = instructorProblemMessage(error);
        this.toast.error(this.i18n.t(message.key, message.params));
      },
    });
  }
}
