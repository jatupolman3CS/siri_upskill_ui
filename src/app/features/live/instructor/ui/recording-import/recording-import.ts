import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCircleNotch, phosphorInfo, phosphorPlugs, phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { LiveInstructorApiService } from '../../../data/live-instructor-api.service';
import type { RecordingImportInfo } from '../../../data/live-instructor.models';
import { instructorProblemMessage, type StatusTone } from '../../../data/live-instructor.util';
import { recordingBlockView } from '../../../data/live-recording-import.util';
import { RecordingUploader } from '../recording-uploader/recording-uploader';

/** Icon colour per tone — whole class names so Tailwind sees them. The sentence itself always stays `--color-text`. */
const ICON_TONE: Record<StatusTone, string> = {
  neutral: 'text-[var(--color-text-muted)]',
  info: 'text-[var(--color-primary-text)]',
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-warning)]',
  danger: 'text-[var(--color-danger)]',
};

/**
 * Everything an ENDED live session shows about its recording (contract `P11-13` §8): the automatic-import status in words,
 * the retry / reconnect actions the server allows, and — always — the manual upload. Used by the course builder's session
 * row and by the session detail page so both read the same way.
 *
 * What it shows comes only from `recordingImport` (the server's decision); this component never works out whether an import
 * is due or retryable. The status sits in one polite, atomic live region so a change ("importing…" -> "added") is announced
 * without moving focus.
 */
@Component({
  selector: 'app-live-recording-import',
  imports: [RouterLink, NgIcon, TranslatePipe, Button, RecordingUploader],
  templateUrl: './recording-import.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCircleNotch, phosphorInfo, phosphorPlugs, phosphorWarningCircle })],
  host: { class: 'block' },
})
export class RecordingImport {
  private readonly api = inject(LiveInstructorApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly courseId = input.required<string>();
  readonly sessionId = input.required<string>();
  readonly sessionTitle = input.required<string>();
  /** The session already has a recording lesson. */
  readonly hasRecording = input(false);
  /** `null` until the list/detail that carries it has loaded. */
  readonly recordingImport = input<RecordingImportInfo | null>(null);
  /** The builder row and the detail page word the plain "attached" / "no recording yet" sentences differently. */
  readonly variant = input<'row' | 'detail'>('row');
  /** Something changed on the server (retry answered, recording uploaded) — the parent refetches. */
  readonly changed = output<void>();

  /** Starts from the server value; the retry answer replaces it at once, and the next server value wins again. */
  private readonly info = linkedSignal(() => this.recordingImport());

  protected readonly view = computed(() => recordingBlockView(this.info(), this.hasRecording()));
  protected readonly retrying = signal(false);
  /** The spinner only turns while an import is running, and holds still for `prefers-reduced-motion`. */
  protected readonly iconClass = computed(() => {
    const tone = ICON_TONE[this.view().tone];
    return this.view().kind === 'importing' ? `${tone} animate-spin motion-reduce:animate-none` : tone;
  });
  protected readonly plainTextKey = computed(() => {
    const attached = this.view().kind === 'attached';
    if (this.variant() === 'detail') {
      return attached ? 'live.instructor.recording.hasRecording' : 'live.instructor.recording.noRecording';
    }
    return attached ? 'live.builder.row.hasRecording' : 'live.builder.row.noRecording';
  });

  protected retry(): void {
    if (this.retrying()) {
      return;
    }
    this.retrying.set(true);
    this.api
      .retryRecordingImport(this.sessionId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => {
          this.retrying.set(false);
          this.info.set(info);
          this.toast.success(this.i18n.t('live.recordingImport.toast.retried'));
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.retrying.set(false);
          const message = instructorProblemMessage(error);
          this.toast.error(this.i18n.t(message.key, message.params));
          // The state may have moved on (another tab, the job) — let the parent show what is true now.
          this.changed.emit();
        },
      });
  }
}
