import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowClockwise, phosphorSpinner, phosphorWarningCircle, phosphorX } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { UploadItem } from './material-upload-queue';

/**
 * One file in the upload queue: waiting, in flight (a progress bar that follows the bytes sent, then "checking and saving"
 * once the whole body is up and the server is still working), or failed with the reason and a retry / dismiss. Purely
 * presentational — the queue owns the state. Progress changes many times a second, so it is NOT a live region; the owning
 * panel announces only the moments that matter (started, done, failed).
 */
@Component({
  selector: 'app-material-upload-row',
  imports: [NgIcon, TranslatePipe],
  templateUrl: './material-upload-row.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowClockwise, phosphorSpinner, phosphorWarningCircle, phosphorX })],
  host: { class: 'flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-3' },
})
export class MaterialUploadRow {
  readonly upload = input.required<UploadItem>();
  readonly retry = output<void>();
  readonly dismiss = output<void>();
}
