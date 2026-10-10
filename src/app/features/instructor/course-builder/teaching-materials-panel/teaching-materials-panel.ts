import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowClockwise, phosphorCaretDown, phosphorCaretRight, phosphorFileText, phosphorInfo, phosphorPaperclip,
  phosphorTrash, phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { Modal } from '../../../../shared/modal/modal';
import { TeachingMaterialsApiService } from '../../../catalog/data/teaching-materials-api.service';
import {
  type TeachingMaterialMessage,
  teachingMaterialErrorMessage,
  teachingMaterialRejectionMessage,
} from '../../../catalog/data/teaching-materials-errors';
import {
  TEACHING_MATERIAL_MAX_PER_PARENT,
  formatFileSize,
  screenTeachingMaterialFiles,
} from '../../../catalog/data/teaching-materials-rules';
import type { TeachingMaterial, TeachingMaterialKind } from '../../../catalog/data/teaching-materials.models';
import { MaterialDropZone } from './material-drop-zone';
import { MaterialUploadQueue } from './material-upload-queue';
import { MaterialUploadRow } from './material-upload-row';

type ListState = 'idle' | 'loading' | 'ready' | 'error';

let nextPanelId = 0;

/**
 * "Teaching materials" for ONE episode or live session in the instructor's builder (P4-03c): the attached files, a drop zone,
 * an upload queue with per-file progress, and delete with a confirmation. Collapsed by default and fetched only when first
 * opened, so a builder with many lessons does not fire a request per row. `parentId` is `null` while an episode exists only
 * in the browser (not autosaved, no server id yet): the panel then explains that instead of calling the API with a made-up id.
 * The server stays the authority on who may upload and what a valid file is; the pre-checks here only save a round trip.
 */
@Component({
  selector: 'app-teaching-materials-panel',
  imports: [NgIcon, TranslatePipe, Button, Modal, MaterialDropZone, MaterialUploadRow],
  templateUrl: './teaching-materials-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowClockwise, phosphorCaretDown, phosphorCaretRight, phosphorFileText, phosphorInfo, phosphorPaperclip,
      phosphorTrash, phosphorWarningCircle,
    }),
  ],
  host: { class: 'block' },
})
export class TeachingMaterialsPanel {
  private readonly api = inject(TeachingMaterialsApiService);
  private readonly i18n = inject(TranslationService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  readonly kind = input.required<TeachingMaterialKind>();
  /** The server id of the episode / session, or `null` when it has none yet. */
  readonly parentId = input.required<string | null>();
  /** `false` hides the upload zone (a cancelled session takes no new files); existing files can still be removed. */
  readonly canUpload = input(true);

  protected readonly bodyId = `teaching-materials-${nextPanelId++}`;
  protected readonly headerButton = viewChild<ElementRef<HTMLButtonElement>>('headerButton');
  protected readonly expanded = signal(false);
  protected readonly listState = signal<ListState>('idle');
  protected readonly materials = signal<readonly TeachingMaterial[]>([]);
  protected readonly notices = signal<readonly { readonly id: number; readonly message: TeachingMaterialMessage }[]>([]);
  protected readonly actionError = signal<TeachingMaterialMessage | null>(null);
  protected readonly announcement = signal('');
  protected readonly deleteTarget = signal<TeachingMaterial | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly deleting = signal(false);
  protected readonly formatSize = formatFileSize;

  protected readonly queue = new MaterialUploadQueue(
    (file) => this.api.upload(this.kind(), this.parentId() ?? '', file),
    {
      started: (file) => this.announce('teachingMaterials.upload.started', file.name),
      uploaded: (material, file) => {
        this.materials.update((list) => [...list, material]);
        this.announce('teachingMaterials.upload.done', file.name);
      },
      failed: (file, error) =>
        this.announcement.set(`${this.i18n.t('teachingMaterials.upload.failed', { name: file.name })}. ${this.i18n.t(error.key, error.params)}`),
    },
  );
  protected readonly uploads = this.queue.items;
  protected readonly isEmpty = computed(() => this.materials().length === 0 && this.uploads().length === 0);

  private loadedFor: string | null = null;
  private loading: Subscription | null = null;
  private noticeId = 0;

  constructor() {
    effect(() => {
      const parentId = this.parentId();
      if (this.expanded() && parentId && parentId !== this.loadedFor) {
        untracked(() => this.load(parentId));
      }
    });
    this.destroyRef.onDestroy(() => {
      this.queue.destroy();
      this.loading?.unsubscribe();
    });
  }

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }

  protected load(parentId: string): void {
    this.loadedFor = parentId;
    this.listState.set('loading');
    this.loading?.unsubscribe();
    this.loading = this.api.list(this.kind(), parentId).subscribe({
      next: (items) => {
        this.materials.set(items);
        this.listState.set('ready');
      },
      error: () => {
        this.loadedFor = null;
        this.listState.set('error');
      },
    });
  }

  protected retryLoad(): void {
    const parentId = this.parentId();
    if (parentId) {
      this.load(parentId);
    }
  }

  protected onFilesPicked(files: readonly File[]): void {
    const queued = this.uploads().filter((item) => item.status !== 'failed').length;
    const room = TEACHING_MATERIAL_MAX_PER_PARENT - this.materials().length - queued;
    const { accepted, rejected } = screenTeachingMaterialFiles(files, room);
    this.notices.set(rejected.map((file) => ({ id: this.noticeId++, message: teachingMaterialRejectionMessage(file) })));
    this.queue.add(accepted);
  }

  protected askDelete(material: TeachingMaterial): void {
    this.deleteTarget.set(material);
    this.actionError.set(null);
    this.confirmOpen.set(true);
  }

  protected confirmDelete(): void {
    const target = this.deleteTarget();
    const parentId = this.parentId();
    if (!target || !parentId || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.remove(this.kind(), parentId, target.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmOpen.set(false);
        this.materials.update((list) => list.filter((item) => item.id !== target.id));
        this.announce('teachingMaterials.delete.done', target.fileName);
        // The row (and the button that opened the dialog) is gone: hand focus to the panel's header instead of losing it.
        afterNextRender(() => this.headerButton()?.nativeElement.focus(), { injector: this.injector });
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.confirmOpen.set(false);
        this.actionError.set(teachingMaterialErrorMessage(error));
      },
    });
  }

  private announce(key: string, name: string): void {
    this.announcement.set(this.i18n.t(key, { name }));
  }
}
