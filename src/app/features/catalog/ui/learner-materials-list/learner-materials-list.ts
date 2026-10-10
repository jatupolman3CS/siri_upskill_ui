import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowClockwise, phosphorDownloadSimple, phosphorFileText, phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { TeachingMaterialsApiService } from '../../data/teaching-materials-api.service';
import { startFileDownload } from '../../data/teaching-materials-download';
import { type TeachingMaterialMessage, teachingMaterialErrorMessage } from '../../data/teaching-materials-errors';
import { formatFileSize } from '../../data/teaching-materials-rules';
import type { TeachingMaterial, TeachingMaterialKind } from '../../data/teaching-materials.models';

type View = 'loading' | 'error' | 'empty' | 'list';

/**
 * What a learner sees of an episode's or a live session's teaching materials: the files, and a download button each. The
 * server decides who may read a list or get a file (no enrollment = 404); this component only renders the answer.
 *
 * `quiet` is for places where materials are a bonus rather than the point (the live tab's session cards): while loading,
 * when there is nothing to show, and when the list cannot be read (a 404 is simply "no access") it renders nothing at all,
 * so a failed request never gets in the way of the rest of the card. A failed *download* is still reported, because the
 * learner just asked for it.
 */
@Component({
  selector: 'app-learner-materials-list',
  imports: [NgIcon, TranslatePipe, Button],
  templateUrl: './learner-materials-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowClockwise, phosphorDownloadSimple, phosphorFileText, phosphorWarningCircle })],
  host: { class: 'block' },
})
export class LearnerMaterialsList {
  private readonly api = inject(TeachingMaterialsApiService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly kind = input.required<TeachingMaterialKind>();
  /** `null` while the owning page has no episode / session chosen yet: nothing is requested. */
  readonly parentId = input<string | null>(null);
  readonly quiet = input(false);
  /** i18n key of an optional heading shown above the list (only when there is a list to show). */
  readonly headingKey = input<string | null>(null);

  private readonly listResource = rxResource({
    params: () => {
      const parentId = this.parentId();
      return parentId ? { kind: this.kind(), parentId } : undefined;
    },
    stream: ({ params }) => this.api.list(params.kind, params.parentId),
  });

  protected readonly items = computed<readonly TeachingMaterial[]>(() => (this.listResource.hasValue() ? this.listResource.value() : []));
  protected readonly view = computed<View>(() => {
    if (this.listResource.status() === 'error') {
      const error = this.listResource.error();
      // 404 = no access / no such episode: for a learner that is "nothing to show", not a failure.
      return error instanceof ApiError && error.status === 404 ? 'empty' : 'error';
    }
    if (!this.listResource.hasValue()) {
      return this.parentId() ? 'loading' : 'empty';
    }
    return this.items().length > 0 ? 'list' : 'empty';
  });
  protected readonly downloadingId = signal<string | null>(null);
  protected readonly downloadError = signal<TeachingMaterialMessage | null>(null);

  protected readonly formatSize = formatFileSize;

  protected retry(): void {
    this.listResource.reload();
  }

  protected download(material: TeachingMaterial): void {
    const parentId = this.parentId();
    if (!parentId || this.downloadingId() !== null) {
      return;
    }
    this.downloadingId.set(material.id);
    this.downloadError.set(null);
    this.api
      .getDownload(this.kind(), parentId, material.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => {
          this.downloadingId.set(null);
          if (!startFileDownload(this.document, info.downloadUrl, info.fileName)) {
            this.downloadError.set({ key: 'teachingMaterials.error.generic' });
          }
        },
        error: (error: unknown) => {
          this.downloadingId.set(null);
          this.downloadError.set(teachingMaterialErrorMessage(error));
        },
      });
  }
}
