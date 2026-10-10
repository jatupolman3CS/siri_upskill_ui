import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCloudArrowUp, phosphorUploadSimple } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import {
  TEACHING_MATERIAL_ACCEPT,
  TEACHING_MATERIAL_MAX_BYTES,
  TEACHING_MATERIAL_MAX_PER_PARENT,
  formatFileSize,
} from '../../../catalog/data/teaching-materials-rules';

/**
 * Where an instructor adds files: a drop target plus a "Choose files" button (the keyboard / screen-reader way in — the hidden
 * native input only exists to open the file dialog). It validates nothing: it hands the raw `File`s to its owner, which
 * screens them and talks to the API.
 */
@Component({
  selector: 'app-material-drop-zone',
  imports: [NgIcon, TranslatePipe, Button],
  templateUrl: './material-drop-zone.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCloudArrowUp, phosphorUploadSimple })],
  host: { class: 'block' },
})
export class MaterialDropZone {
  readonly picked = output<readonly File[]>();

  protected readonly dragging = signal(false);
  protected readonly accept = TEACHING_MATERIAL_ACCEPT;
  protected readonly hintParams = {
    size: formatFileSize(TEACHING_MATERIAL_MAX_BYTES),
    max: TEACHING_MATERIAL_MAX_PER_PARENT,
  };

  /** Lets the owner stop accepting files while it is busy elsewhere (e.g. a delete is in progress). */
  readonly disabled = input(false);

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Reset so choosing the same file again (after fixing it) fires `change` again.
    input.value = '';
    this.emit(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled()) {
      return;
    }
    // Without preventDefault the browser never treats the zone as a drop target (and would open the file instead).
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    const zone = event.currentTarget as HTMLElement;
    // `dragleave` also fires when the pointer moves onto a child of the zone; only a real exit ends the highlight.
    if (!(event.relatedTarget instanceof Node) || !zone.contains(event.relatedTarget)) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (!this.disabled()) {
      this.emit(Array.from(event.dataTransfer?.files ?? []));
    }
  }

  private emit(files: readonly File[]): void {
    if (files.length > 0) {
      this.picked.emit(files);
    }
  }
}
