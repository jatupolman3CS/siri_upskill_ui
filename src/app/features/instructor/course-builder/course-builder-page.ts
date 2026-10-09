import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowClockwise,
  phosphorArrowCounterClockwise,
  phosphorArrowDown,
  phosphorArrowLeft,
  phosphorArrowUp,
  phosphorCheckCircle,
  phosphorDotsSixVertical,
  phosphorFloppyDisk,
  phosphorPlayCircle,
  phosphorPlus,
  phosphorSparkle,
  phosphorSpinner,
  phosphorTrash,
  phosphorUploadSimple,
  phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';
import { Observable, Subject, Subscription, of } from 'rxjs';
import { catchError, concatMap, debounceTime, filter, map, switchMap, take, tap } from 'rxjs/operators';

import {
  AutosaveCourseCommand,
  AutosaveCourseResponse,
  CourseBuilderResponse,
  CourseLevel,
} from '../../catalog/data/course-api.models';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CategoryApiService } from '../../catalog/data/category-api.service';
import { CourseApiService } from '../../catalog/data/course-api.service';
import { MediaApiService } from '../../media/data/media-api.service';
import { MediaAssetResponse } from '../../media/data/media-api.models';
import { AuthService } from '../../../core/auth/auth.service';
import { notConfiguredMessageKey } from '../../../core/http/provider-errors';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';
import { LiveInstructorApiService } from '../../live/data/live-instructor-api.service';
import { LiveSubmitIssues } from '../../live/data/live-submit-issues.service';
import type { DeliveryFormat } from '../../live/data/live.models';
import { LiveSchedulePanel } from './live-schedule-panel/live-schedule-panel';

export interface BuilderEpisode {
  id: string;
  title: string;
  durationSeconds: number;
  isFreePreview: boolean;
  mediaAssetId?: string | null;
  videoStatus?: 'none' | 'uploading' | 'processing' | 'ready' | 'failed';
  uploadProgress?: number;
  errorMessage?: string | null;
}

export interface BuilderSection {
  id: string;
  title: string;
  episodes: BuilderEpisode[];
}

export interface BuilderStateSnapshot {
  title: string;
  subtitle: string;
  description: string;
  categoryId: string;
  price: number;
  comparePrice: number | null;
  level: CourseLevel;
  thumbnailUrl: string;
  seoTitle: string;
  seoDescription: string;
  outcomes: string[];
  requirements: string[];
  sections: BuilderSection[];
  trailerMediaAssetId?: string | null;
}

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'conflict' | 'error';

@Component({
  selector: 'app-course-builder-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DragDropModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    NgIcon,
    TranslatePipe,
    Spinner,
    LiveSchedulePanel,
  ],
  templateUrl: './course-builder-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowClockwise,
      phosphorArrowCounterClockwise,
      phosphorArrowDown,
      phosphorArrowLeft,
      phosphorArrowUp,
      phosphorCheckCircle,
      phosphorDotsSixVertical,
      phosphorFloppyDisk,
      phosphorPlayCircle,
      phosphorPlus,
      phosphorSparkle,
      phosphorSpinner,
      phosphorTrash,
      phosphorUploadSimple,
      phosphorWarningCircle,
    }),
  ],
})
export class CourseBuilderPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseApi = inject(CourseApiService);
  private readonly categoryApi = inject(CategoryApiService);
  private readonly mediaApi = inject(MediaApiService);
  protected readonly translationService = inject(TranslationService);
  private readonly seoService = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activeTab = signal<'basic' | 'curriculum' | 'publish' | 'live'>('basic');
  private readonly liveIssues = inject(LiveSubmitIssues);
  private readonly liveApi = inject(LiveInstructorApiService);
  /** The course's delivery format; `null` until it is known (reported by the live tab, or read on demand when the instructor goes to submit). */
  private readonly deliveryFormat = signal<DeliveryFormat | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly saveSuccess = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isConflict = signal(false);

  // Autosave & Save Status
  public readonly saveStatus = signal<SaveStatus>('idle');
  public readonly lastSavedTime = signal<string | null>(null);
  protected readonly isSaving = computed(() => this.saveStatus() === 'saving');
  protected readonly liveAnnouncement = signal<string>('');
  private readonly autosaveTrigger$ = new Subject<void>();

  // History Stack (Undo / Redo)
  private readonly historyPast = signal<BuilderStateSnapshot[]>([]);
  private readonly historyFuture = signal<BuilderStateSnapshot[]>([]);
  private readonly maxHistoryLength = 30;
  private isApplyingHistory = false;
  protected readonly historyToast = signal<string | null>(null);
  private historyToastTimeout: ReturnType<typeof setTimeout> | null = null;

  public readonly canUndo = computed(() => this.historyPast().length > 0);
  public readonly canRedo = computed(() => this.historyFuture().length > 0);

  // Metadata
  protected readonly courseId = signal<string | null>(null);
  protected readonly rowVersion = signal<string>('');
  protected readonly categories = signal<CategoryTreeNode[]>([]);
  /** True once the public category list has loaded (even when empty), so "no categories yet" is not shown while loading. */
  private readonly categoriesLoaded = signal(false);
  protected readonly noCategoriesYet = computed(() => this.categoriesLoaded() && this.categories().length === 0);
  protected readonly auth = inject(AuthService);

  // Form Fields
  // A new course starts blank: nothing the instructor did not type may be saved into the real draft.
  protected readonly courseTitle = signal('');
  protected readonly courseSubtitle = signal('');
  protected readonly courseDescription = signal('');
  protected readonly categoryId = signal<string>('');
  protected readonly coursePrice = signal<number>(0);
  protected readonly comparePrice = signal<number | null>(null);
  protected readonly courseLevel = signal<CourseLevel>('Beginner');
  protected readonly thumbnailUrl = signal<string>('');
  protected readonly seoTitle = signal<string>('');
  protected readonly seoDescription = signal<string>('');
  protected readonly outcomes = signal<string[]>([]);
  protected readonly requirements = signal<string[]>([]);
  protected readonly newOutcome = signal<string>('');
  protected readonly newRequirement = signal<string>('');

  // Course Trailer Media
  protected readonly trailerMediaAssetId = signal<string | null>(null);
  protected readonly trailerStatus = signal<'none' | 'uploading' | 'processing' | 'ready' | 'failed'>('none');
  protected readonly trailerUploadProgress = signal<number>(0);
  protected readonly trailerError = signal<string | null>(null);
  private readonly mediaOperations = new Map<string, Subscription>();
  private readonly episodeIdAliases = new Map<string, string>();

  // Curriculum Sections
  // Empty by default (a loaded course replaces it from the server): the instructor adds the first section.
  protected readonly sections = signal<BuilderSection[]>([]);

  protected readonly sectionDropListIds = computed(() => {
    return this.sections().map((_, idx) => `ep-drop-list-${idx}`);
  });

  ngOnInit(): void {
    this.seoService.set({
      title: this.translationService.t('instructor.builder.pageTitle'),
      description: this.translationService.t('instructor.builder.pageDescription'),
      path: '/instructor/courses/builder',
      robots: 'noindex',
    });

    this.setupAutosavePipeline();

    this.categoryApi
      .getCategoryTree()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tree) => {
          const list: readonly CategoryTreeNode[] = tree;
          const flat: CategoryTreeNode[] = [];
          const flatten = (nodes: readonly CategoryTreeNode[]) => {
            if (!Array.isArray(nodes)) return;
            for (const node of nodes) {
              flat.push(node);
              if (node.children?.length) {
                flatten(node.children);
              }
            }
          };
          flatten(list);
          this.categories.set(flat);
          this.categoriesLoaded.set(true);
        },
        error: (err) => {
          console.error('Failed to load categories', err);
        },
      });

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.courseId.set(id);
      this.loadCourse(id);
    }
  }

  private setupAutosavePipeline(): void {
    this.autosaveTrigger$
      .pipe(
        debounceTime(1500),
        concatMap(() => {
          const id = this.courseId();
          if (!id || this.saveStatus() === 'conflict' || this.isLoading()) {
            return of(null);
          }
          this.saveStatus.set('saving');
          this.errorMessage.set(null);
          return this.saveCurrentState(id).pipe(
            tap((res) => {
              this.rowVersion.set(res.rowVersion);
              this.saveStatus.set('saved');
              this.isConflict.set(false);
              const now = new Date();
              this.lastSavedTime.set(
                now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              );
            }),
            catchError((err) => {
              if (err?.status === 409) {
                this.isConflict.set(true);
                this.saveStatus.set('conflict');
                this.errorMessage.set('instructor.builder.concurrencyConflict');
              } else {
                this.saveStatus.set('error');
                this.errorMessage.set('instructor.builder.saveFailed');
              }
              return of(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    if (!isCtrlOrMeta) return;

    const target = event.target as HTMLElement | null;
    const isTextInput =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);

    // Ctrl+Z (Undo)
    if (event.key === 'z' && !event.shiftKey) {
      if (!isTextInput && this.canUndo()) {
        event.preventDefault();
        this.undo();
      }
    }
    // Ctrl+Y or Ctrl+Shift+Z (Redo)
    else if (
      event.key === 'y' ||
      (event.key === 'z' && event.shiftKey) ||
      (event.key === 'Z' && event.shiftKey)
    ) {
      if (!isTextInput && this.canRedo()) {
        event.preventDefault();
        this.redo();
      }
    }
  }

  protected reloadCourse(): void {
    const id = this.courseId();
    if (id) {
      this.loadCourse(id);
    }
  }

  private loadCourse(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.isConflict.set(false);

    this.courseApi
      .getCourseBuilder(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (course) => {
          this.isLoading.set(false);
          this.populateFromBuilder(course);
          this.historyPast.set([]);
          this.historyFuture.set([]);
          this.saveStatus.set('saved');
        },
        error: () => {
          this.isLoading.set(false);
          this.saveStatus.set('error');
          this.errorMessage.set('common.error');
        },
      });
  }

  private populateFromBuilder(course: CourseBuilderResponse): void {
    this.mediaOperations.forEach((operation) => operation.unsubscribe());
    this.mediaOperations.clear();
    this.courseId.set(course.id);
    this.rowVersion.set(course.rowVersion);
    this.courseTitle.set(course.title);
    this.courseSubtitle.set(course.subtitle ?? '');
    this.courseDescription.set(course.description ?? '');
    this.categoryId.set(course.categoryId);
    this.coursePrice.set(course.price);
    this.comparePrice.set(course.comparePrice);
    this.courseLevel.set(course.level);
    this.thumbnailUrl.set(course.thumbnailUrl ?? '');
    this.seoTitle.set(course.seoTitle ?? '');
    this.seoDescription.set(course.seoDescription ?? '');
    this.outcomes.set(course.outcomes ? [...course.outcomes] : []);
    this.requirements.set(course.requirements ? [...course.requirements] : []);

    if (course.trailerMediaAssetId) {
      this.trailerMediaAssetId.set(course.trailerMediaAssetId);
      this.trailerStatus.set('processing');
    } else {
      this.trailerMediaAssetId.set(null);
      this.trailerStatus.set('none');
    }

      this.sections.set(
        course.sections.map((s) => ({
          id: s.id,
          title: s.title,
          episodes: s.episodes.map((e) => ({
            id: e.id,
            title: e.title,
            durationSeconds: e.durationSeconds ?? 0,
            isFreePreview: e.isFreePreview,
            mediaAssetId: e.mediaAssetId ?? null,
            videoStatus: e.mediaAssetId ? 'processing' : 'none',
          })),
        }))
      );
    for (const section of this.sections()) {
      for (const episode of section.episodes) {
        if (episode.mediaAssetId) {
          this.mediaOperations.set(episode.id, this.mediaApi.watchAsset(episode.mediaAssetId)
            .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
              next: (asset) => this.applyEpisodeAsset(episode.id, asset),
              error: () => this.updateEpisodeMedia(episode.id, { videoStatus: 'failed', errorMessage: 'instructor.builder.upload.statusFailed' }),
            }));
        }
      }
    }
    if (course.trailerMediaAssetId) {
      this.mediaOperations.set('trailer', this.mediaApi.watchAsset(course.trailerMediaAssetId)
        .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (asset) => this.applyTrailerAsset(asset),
          error: () => {
            this.trailerStatus.set('failed');
            this.trailerError.set('instructor.builder.upload.statusFailed');
          },
        }));
    }
  }

  // --- Snapshot & History (Undo / Redo) ---

  private getCurrentSnapshot(): BuilderStateSnapshot {
    return {
      title: this.courseTitle(),
      subtitle: this.courseSubtitle(),
      description: this.courseDescription(),
      categoryId: this.categoryId(),
      price: this.coursePrice(),
      comparePrice: this.comparePrice(),
      level: this.courseLevel(),
      thumbnailUrl: this.thumbnailUrl(),
      seoTitle: this.seoTitle(),
      seoDescription: this.seoDescription(),
      outcomes: [...this.outcomes()],
      requirements: [...this.requirements()],
      sections: this.sections().map((s) => ({
        id: s.id,
        title: s.title,
        episodes: s.episodes.map((e) => ({ ...e })),
      })),
      trailerMediaAssetId: this.trailerMediaAssetId(),
    };
  }

  public recordSnapshot(): void {
    if (this.isApplyingHistory) return;
    const current = this.getCurrentSnapshot();
    this.historyPast.update((stack) => {
      const next = [...stack, current];
      if (next.length > this.maxHistoryLength) {
        return next.slice(next.length - this.maxHistoryLength);
      }
      return next;
    });
    this.historyFuture.set([]);
    this.markUnsaved();
  }

  public undo(): void {
    if (!this.canUndo()) return;
    const past = this.historyPast();
    const previous = past[past.length - 1];
    const current = this.getCurrentSnapshot();

    this.historyPast.set(past.slice(0, past.length - 1));
    this.historyFuture.update((future) => [current, ...future]);

    this.applySnapshot(previous);
    this.showHistoryToast('instructor.builder.undoPerformed');
    this.announceMessage(this.translationService.t('instructor.builder.undoPerformed'));
    this.markUnsaved();
    this.triggerAutosave();
  }

  public redo(): void {
    if (!this.canRedo()) return;
    const future = this.historyFuture();
    const next = future[0];
    const current = this.getCurrentSnapshot();

    this.historyFuture.set(future.slice(1));
    this.historyPast.update((past) => [...past, current]);

    this.applySnapshot(next);
    this.showHistoryToast('instructor.builder.redoPerformed');
    this.announceMessage(this.translationService.t('instructor.builder.redoPerformed'));
    this.markUnsaved();
    this.triggerAutosave();
  }

  private applySnapshot(snapshot: BuilderStateSnapshot): void {
    this.isApplyingHistory = true;
    try {
      this.courseTitle.set(snapshot.title);
      this.courseSubtitle.set(snapshot.subtitle);
      this.courseDescription.set(snapshot.description);
      this.categoryId.set(snapshot.categoryId);
      this.coursePrice.set(snapshot.price);
      this.comparePrice.set(snapshot.comparePrice);
      this.courseLevel.set(snapshot.level);
      this.thumbnailUrl.set(snapshot.thumbnailUrl);
      this.seoTitle.set(snapshot.seoTitle ?? '');
      this.seoDescription.set(snapshot.seoDescription ?? '');
      this.outcomes.set([...snapshot.outcomes]);
      this.requirements.set([...snapshot.requirements]);
      if (snapshot.trailerMediaAssetId !== undefined) {
        this.trailerMediaAssetId.set(snapshot.trailerMediaAssetId);
        this.trailerStatus.set(snapshot.trailerMediaAssetId ? 'ready' : 'none');
      }
      this.sections.set(
        snapshot.sections.map((s) => ({
          id: s.id,
          title: s.title,
          episodes: s.episodes.map((e) => ({ ...e })),
        }))
      );
    } finally {
      this.isApplyingHistory = false;
    }
  }

  public addOutcome(): void {
    const val = this.newOutcome().trim();
    if (!val) return;
    this.recordSnapshot();
    this.outcomes.update((list) => [...list, val]);
    this.newOutcome.set('');
    this.triggerAutosave();
  }

  public removeOutcome(index: number): void {
    this.recordSnapshot();
    this.outcomes.update((list) => list.filter((_, i) => i !== index));
    this.triggerAutosave();
  }

  public updateOutcome(index: number, val: string): void {
    this.recordSnapshot();
    this.outcomes.update((list) => list.map((item, i) => (i === index ? val : item)));
    this.triggerAutosave();
  }

  public addRequirement(): void {
    const val = this.newRequirement().trim();
    if (!val) return;
    this.recordSnapshot();
    this.requirements.update((list) => [...list, val]);
    this.newRequirement.set('');
    this.triggerAutosave();
  }

  public removeRequirement(index: number): void {
    this.recordSnapshot();
    this.requirements.update((list) => list.filter((_, i) => i !== index));
    this.triggerAutosave();
  }

  public updateRequirement(index: number, val: string): void {
    this.recordSnapshot();
    this.requirements.update((list) => list.map((item, i) => (i === index ? val : item)));
    this.triggerAutosave();
  }

  private showHistoryToast(messageKey: string): void {
    if (this.historyToastTimeout) {
      clearTimeout(this.historyToastTimeout);
    }
    this.historyToast.set(messageKey);
    this.historyToastTimeout = setTimeout(() => {
      this.historyToast.set(null);
    }, 2500);
  }

  public markUnsaved(): void {
    if (this.saveStatus() !== 'saving' && this.saveStatus() !== 'conflict') {
      this.saveStatus.set('unsaved');
    }
  }

  public triggerAutosave(): void {
    this.markUnsaved();
    this.autosaveTrigger$.next();
  }

  protected announceMessage(message: string): void {
    this.liveAnnouncement.set(message);
  }

  // --- Curriculum Actions (Add / Remove / Modify) ---

  public addSection(): void {
    this.recordSnapshot();
    const count = this.sections().length + 1;
    this.sections.update((list) => [
      ...list,
      {
        id: `sec-temp-${Date.now()}`,
        title: this.translationService.t('instructor.builder.curriculum.sectionLabel', { index: count }),
        episodes: [
          {
            id: `ep-temp-${Date.now()}`,
            title: this.translationService.t('instructor.builder.curriculum.episodeLabel', { index: 1 }),
            durationSeconds: 0,
            isFreePreview: false,
          },
        ],
      },
    ]);
    this.announceMessage(this.translationService.t('instructor.builder.curriculum.addSection'));
    this.triggerAutosave();
  }

  public removeSection(index: number): void {
    for (const episode of this.sections()[index]?.episodes ?? []) {
      this.mediaOperations.get(episode.id)?.unsubscribe();
      this.mediaOperations.delete(episode.id);
    }
    this.recordSnapshot();
    this.sections.update((list) => list.filter((_, idx) => idx !== index));
    this.announceMessage(this.translationService.t('instructor.builder.curriculum.deleteSection'));
    this.triggerAutosave();
  }

  public updateSectionTitle(sectionIndex: number, newTitle: string): void {
    this.sections.update((list) =>
      list.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        return { ...sec, title: newTitle };
      })
    );
    this.triggerAutosave();
  }

  public addEpisode(sectionIndex: number): void {
    this.recordSnapshot();
    this.sections.update((list) =>
      list.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        const newEpNum = sec.episodes.length + 1;
        return {
          ...sec,
          episodes: [
            ...sec.episodes,
            {
              id: `ep-temp-${Date.now()}`,
              title: this.translationService.t('instructor.builder.curriculum.episodeLabel', { index: newEpNum }),
              durationSeconds: 0,
              isFreePreview: false,
            },
          ],
        };
      })
    );
    this.announceMessage(this.translationService.t('instructor.builder.curriculum.addEpisode'));
    this.triggerAutosave();
  }

  public removeEpisode(sectionIndex: number, episodeIndex: number): void {
    const episode = this.sections()[sectionIndex]?.episodes[episodeIndex];
    if (episode) {
      this.mediaOperations.get(episode.id)?.unsubscribe();
      this.mediaOperations.delete(episode.id);
    }
    this.recordSnapshot();
    this.sections.update((list) =>
      list.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        return {
          ...sec,
          episodes: sec.episodes.filter((_, epIdx) => epIdx !== episodeIndex),
        };
      })
    );
    this.announceMessage(this.translationService.t('instructor.builder.curriculum.deleteEpisode'));
    this.triggerAutosave();
  }

  public updateEpisodeTitle(
    sectionIndex: number,
    episodeIndex: number,
    newTitle: string
  ): void {
    this.sections.update((list) =>
      list.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        return {
          ...sec,
          episodes: sec.episodes.map((ep, epIdx) => {
            if (epIdx !== episodeIndex) return ep;
            return { ...ep, title: newTitle };
          }),
        };
      })
    );
    this.triggerAutosave();
  }

  public toggleFreePreview(sectionIndex: number, episodeIndex: number): void {
    this.recordSnapshot();
    this.sections.update((list) =>
      list.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        return {
          ...sec,
          episodes: sec.episodes.map((ep, epIdx) => {
            if (epIdx !== episodeIndex) return ep;
            return { ...ep, isFreePreview: !ep.isFreePreview };
          }),
        };
      })
    );
    this.triggerAutosave();
  }

  // --- Drag & Drop (CDK) ---

  public onSectionDrop(event: CdkDragDrop<BuilderSection[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.recordSnapshot();
    const currentSections = [...this.sections()];
    moveItemInArray(currentSections, event.previousIndex, event.currentIndex);
    this.sections.set(currentSections);
    this.announceMessage(
      this.translationService.t('instructor.builder.curriculum.sectionMoved', {
        index: String(event.currentIndex + 1),
      })
    );
    this.triggerAutosave();
  }

  public onEpisodeDrop(
    event: CdkDragDrop<BuilderEpisode[]>,
    targetSectionIndex: number
  ): void {
    if (
      event.previousContainer === event.container &&
      event.previousIndex === event.currentIndex
    ) {
      return;
    }

    this.recordSnapshot();
    const currentSections = [...this.sections()];

    if (event.previousContainer === event.container) {
      const episodes = [...currentSections[targetSectionIndex].episodes];
      moveItemInArray(episodes, event.previousIndex, event.currentIndex);
      currentSections[targetSectionIndex] = {
        ...currentSections[targetSectionIndex],
        episodes,
      };
      this.sections.set(currentSections);
    } else {
      const sourceSectionIndex = this.sections().findIndex(
        (_, idx) => `ep-drop-list-${idx}` === event.previousContainer.id
      );
      if (sourceSectionIndex === -1) return;

      const sourceEpisodes = [...currentSections[sourceSectionIndex].episodes];
      const targetEpisodes = [...currentSections[targetSectionIndex].episodes];

      transferArrayItem(
        sourceEpisodes,
        targetEpisodes,
        event.previousIndex,
        event.currentIndex
      );

      currentSections[sourceSectionIndex] = {
        ...currentSections[sourceSectionIndex],
        episodes: sourceEpisodes,
      };
      currentSections[targetSectionIndex] = {
        ...currentSections[targetSectionIndex],
        episodes: targetEpisodes,
      };
      this.sections.set(currentSections);
    }

    this.announceMessage(
      this.translationService.t('instructor.builder.curriculum.episodeMoved')
    );
    this.triggerAutosave();
  }

  // --- Keyboard Reordering (A11y) ---

  public moveSectionUp(index: number): void {
    if (index <= 0) return;
    this.recordSnapshot();
    const currentSections = [...this.sections()];
    moveItemInArray(currentSections, index, index - 1);
    this.sections.set(currentSections);
    this.announceMessage(
      this.translationService.t('instructor.builder.curriculum.sectionMoved', {
        index: String(index),
      })
    );
    this.triggerAutosave();
  }

  public moveSectionDown(index: number): void {
    if (index >= this.sections().length - 1) return;
    this.recordSnapshot();
    const currentSections = [...this.sections()];
    moveItemInArray(currentSections, index, index + 1);
    this.sections.set(currentSections);
    this.announceMessage(
      this.translationService.t('instructor.builder.curriculum.sectionMoved', {
        index: String(index + 2),
      })
    );
    this.triggerAutosave();
  }

  public moveEpisodeUp(sectionIndex: number, episodeIndex: number): void {
    if (episodeIndex <= 0) return;
    this.recordSnapshot();
    const currentSections = [...this.sections()];
    const episodes = [...currentSections[sectionIndex].episodes];
    moveItemInArray(episodes, episodeIndex, episodeIndex - 1);
    currentSections[sectionIndex] = {
      ...currentSections[sectionIndex],
      episodes,
    };
    this.sections.set(currentSections);
    this.announceMessage(
      this.translationService.t('instructor.builder.curriculum.episodeMoved')
    );
    this.triggerAutosave();
  }

  public moveEpisodeDown(sectionIndex: number, episodeIndex: number): void {
    const currentSection = this.sections()[sectionIndex];
    if (!currentSection || episodeIndex >= currentSection.episodes.length - 1) return;
    this.recordSnapshot();
    const currentSections = [...this.sections()];
    const episodes = [...currentSections[sectionIndex].episodes];
    moveItemInArray(episodes, episodeIndex, episodeIndex + 1);
    currentSections[sectionIndex] = {
      ...currentSections[sectionIndex],
      episodes,
    };
    this.sections.set(currentSections);
    this.announceMessage(
      this.translationService.t('instructor.builder.curriculum.episodeMoved')
    );
    this.triggerAutosave();
  }

  // --- Form & Command Builders ---

  public onFieldChange(): void {
    this.triggerAutosave();
  }

  public buildAutosaveCommand(): AutosaveCourseCommand {
    return {
      title: this.courseTitle(),
      subtitle: this.courseSubtitle() || null,
      description: this.courseDescription() || null,
      categoryId: this.categoryId(),
      level: this.courseLevel(),
      language: 'Thai',
      thumbnailUrl: this.thumbnailUrl() || null,
      price: Number(this.coursePrice()),
      comparePrice: this.comparePrice() ? Number(this.comparePrice()) : null,
      accessDurationDays: 365,
      seoTitle: this.seoTitle() || null,
      seoDescription: this.seoDescription() || null,
      outcomes: this.outcomes(),
      requirements: this.requirements(),
      sections: this.sections().map((s, sIdx) => ({
        id: s.id.startsWith('sec-temp-') ? null : s.id,
        title: s.title,
        sortOrder: sIdx,
        episodes: s.episodes.map((e, eIdx) => ({
          id: e.id.startsWith('ep-temp-') ? null : e.id,
          title: e.title,
          description: null,
          sortOrder: eIdx,
          isFreePreview: e.isFreePreview,
          mediaAssetId: e.mediaAssetId || null,
          durationSeconds: e.durationSeconds || null,
        })),
      })),
      rowVersion: this.rowVersion(),
      trailerMediaAssetId: this.trailerMediaAssetId() || null,
    };
  }

  // --- Video & Trailer Upload Methods ---

  public formatDuration(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '00:00';
    const totalSecs = Math.round(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs > 0) {
      return `${hrs}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  public onEpisodeVideoSelected(sectionIndex: number, episodeIndex: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    input.value = '';
    const episode = this.sections()[sectionIndex]?.episodes[episodeIndex];
    if (!episode || episode.videoStatus === 'uploading' || episode.videoStatus === 'processing') return;
    const validationError = this.mediaApi.validateVideoFile(file);
    if (validationError) {
      this.updateEpisodeMedia(episode.id, { videoStatus: 'failed', errorMessage: validationError });
      return;
    }

    this.recordSnapshot();
    this.mediaOperations.get(episode.id)?.unsubscribe();
    this.updateEpisodeMedia(episode.id, { videoStatus: 'uploading', uploadProgress: 0, errorMessage: null });
    this.mediaOperations.set(episode.id, this.uploadMedia(file, episode.title || file.name,
      (progress) => this.updateEpisodeMedia(episode.id, { uploadProgress: progress }))
      .pipe(
        switchMap((asset) => {
          this.updateEpisodeMedia(episode.id, {
            mediaAssetId: asset.id, durationSeconds: 0, videoStatus: 'processing', uploadProgress: 100,
          });
          // Persist the draft reference while encoding, through the existing row-version-aware autosave.
          this.triggerAutosave();
          return this.mediaApi.watchAsset(asset.id);
        }),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe({
        next: (asset) => this.applyEpisodeAsset(episode.id, asset),
        // A 503 "video provider not configured" is an outage the instructor can only wait out — say so instead of
        // blaming their connection; the row's retry button stays available either way.
        error: (error: unknown) => this.updateEpisodeMedia(episode.id, {
          videoStatus: 'failed',
          errorMessage: notConfiguredMessageKey(error) ?? 'instructor.builder.upload.transferFailed',
        }),
      }));
  }

  private saveCurrentState(id: string): Observable<AutosaveCourseResponse> {
    // Match server-assigned IDs to the submitted snapshot, even if the user reorders while saving.
    const submitted = this.sections().map((section) => ({
      id: section.id, episodeIds: section.episodes.map((episode) => episode.id),
    }));
    return this.courseApi.autosaveCourse(id, this.buildAutosaveCommand()).pipe(tap((response) => {
      if (!response.sections) return;
      const ids = new Map<string, string>();
      response.sections.forEach((section, sectionIndex) => {
        const original = submitted[sectionIndex];
        if (!original) return;
        ids.set(original.id, section.id);
        section.episodes.forEach((episode, episodeIndex) => {
          const originalId = original.episodeIds[episodeIndex];
          if (!originalId) return;
          ids.set(originalId, episode.id);
          if (originalId !== episode.id) {
            this.episodeIdAliases.set(originalId, episode.id);
            const operation = this.mediaOperations.get(originalId);
            if (operation) {
              this.mediaOperations.delete(originalId);
              this.mediaOperations.set(episode.id, operation);
            }
          }
        });
      });
      const reconcile = (sections: BuilderSection[]): BuilderSection[] => sections.map((section) => ({
        ...section, id: ids.get(section.id) ?? section.id,
        episodes: section.episodes.map((episode) => ({ ...episode, id: ids.get(episode.id) ?? episode.id })),
      }));
      this.sections.update(reconcile);
      this.historyPast.update((history) => history.map((snapshot) => ({ ...snapshot, sections: reconcile(snapshot.sections) })));
      this.historyFuture.update((history) => history.map((snapshot) => ({ ...snapshot, sections: reconcile(snapshot.sections) })));
    }));
  }

  private uploadMedia(file: File, title: string, onProgress: (progress: number) => void): Observable<MediaAssetResponse> {
    return this.mediaApi.createAsset({ title }).pipe(
      switchMap((asset) => this.mediaApi.createUploadSession(asset.id).pipe(
        switchMap((session) => this.mediaApi.uploadVideoFile(session.uploadUrl, file).pipe(
          tap((progress) => onProgress(progress.progress)),
          filter((progress) => progress.isComplete),
          take(1),
          switchMap(() => this.mediaApi.completeUploadSession(session.id)),
          map(() => asset),
        )),
      )),
    );
  }

  private updateEpisodeMedia(episodeId: string, changes: Partial<BuilderEpisode>): void {
    episodeId = this.episodeIdAliases.get(episodeId) ?? episodeId;
    this.sections.update((sections) => sections.map((section) => ({
      ...section,
      episodes: section.episodes.map((episode) => episode.id === episodeId ? { ...episode, ...changes } : episode),
    })));
  }

  private applyEpisodeAsset(episodeId: string, asset: MediaAssetResponse): void {
    episodeId = this.episodeIdAliases.get(episodeId) ?? episodeId;
    const episode = this.sections().flatMap((section) => section.episodes).find((item) => item.id === episodeId);
    if (!episode || episode.mediaAssetId !== asset.id) return;
    const duration = asset.durationSeconds ?? 0;
    const durationChanged = asset.status === 'Ready' && duration !== episode.durationSeconds;
    this.updateEpisodeMedia(episodeId, {
      videoStatus: asset.status === 'Ready' ? 'ready' : asset.status === 'Failed' ? 'failed' : 'processing',
      durationSeconds: duration,
      errorMessage: asset.status === 'Failed' ? 'instructor.builder.upload.processingFailed' : null,
    });
    if (durationChanged) this.triggerAutosave();
  }

  private applyTrailerAsset(asset: MediaAssetResponse): void {
    if (this.trailerMediaAssetId() !== asset.id) return;
    this.trailerStatus.set(asset.status === 'Ready' ? 'ready' : asset.status === 'Failed' ? 'failed' : 'processing');
    this.trailerError.set(asset.status === 'Failed' ? 'instructor.builder.upload.processingFailed' : null);
  }

  public removeEpisodeVideo(sectionIndex: number, episodeIndex: number): void {
    const currentSections = this.sections();
    const section = currentSections[sectionIndex];
    if (!section) return;
    const episode = section.episodes[episodeIndex];
    if (!episode) return;

    this.mediaOperations.get(episode.id)?.unsubscribe();
    this.recordSnapshot();

    this.updateEpisodeMedia(episode.id, {
      mediaAssetId: null, videoStatus: 'none', uploadProgress: 0, durationSeconds: 0, errorMessage: null,
    });
    this.triggerAutosave();
  }

  public onTrailerSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.trailerStatus() === 'uploading' || this.trailerStatus() === 'processing') return;
    input.value = '';
    const validationError = this.mediaApi.validateVideoFile(file);
    if (validationError) {
      this.trailerStatus.set('failed');
      this.trailerError.set(validationError);
      return;
    }
    this.recordSnapshot();
    this.mediaOperations.get('trailer')?.unsubscribe();
    this.trailerStatus.set('uploading');
    this.trailerUploadProgress.set(0);
    this.trailerError.set(null);

    this.mediaOperations.set('trailer', this.uploadMedia(file, `${this.courseTitle()} - Trailer`,
      (progress) => this.trailerUploadProgress.set(progress)).pipe(
      switchMap((asset) => {
        this.trailerMediaAssetId.set(asset.id);
        this.trailerStatus.set('processing');
        this.trailerUploadProgress.set(100);
        this.triggerAutosave();
        return this.mediaApi.watchAsset(asset.id);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (asset) => this.applyTrailerAsset(asset),
      error: (error: unknown) => {
        this.trailerStatus.set('failed');
        this.trailerError.set(notConfiguredMessageKey(error) ?? 'instructor.builder.upload.transferFailed');
      },
    }));
  }

  public removeTrailer(): void {
    this.mediaOperations.get('trailer')?.unsubscribe();
    this.recordSnapshot();
    this.trailerMediaAssetId.set(null);
    this.trailerStatus.set('none');
    this.trailerUploadProgress.set(0);
    this.trailerError.set(null);
    this.triggerAutosave();
  }

  // --- Save / Publish Pipelines (Clean RxJS switchMap) ---

  public saveCourse(): void {
    if (!this.courseTitle().trim()) {
      this.errorMessage.set('instructor.builder.validation.titleRequired');
      this.saveStatus.set('error');
      return;
    }

    if (!this.categoryId()) {
      this.errorMessage.set('instructor.builder.validation.categoryRequired');
      this.saveStatus.set('error');
      return;
    }

    const id = this.courseId();
    this.saveStatus.set('saving');
    this.saveSuccess.set(false);
    this.errorMessage.set(null);
    this.isConflict.set(false);

    if (!id) {
      this.courseApi
        .createCourse({
          title: this.courseTitle(),
          categoryId: this.categoryId(),
          level: this.courseLevel(),
          language: 'Thai',
          price: Number(this.coursePrice()),
        })
        .pipe(
          switchMap((created) => {
            this.courseId.set(created.id);
            return this.courseApi.getCourseBuilder(created.id);
          }),
          switchMap((builder) => {
            this.rowVersion.set(builder.rowVersion);
            return this.saveCurrentState(builder.id);
          }),
          tap((res) => {
            this.rowVersion.set(res.rowVersion);
            this.saveStatus.set('saved');
            this.saveSuccess.set(true);
            const now = new Date();
            this.lastSavedTime.set(
              now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
            setTimeout(() => this.saveSuccess.set(false), 3000);
            this.openCourseRoute();
          }),
          catchError((err) => {
            if (err?.status === 409) {
              this.isConflict.set(true);
              this.saveStatus.set('conflict');
              this.errorMessage.set('instructor.builder.concurrencyConflict');
            } else {
              this.saveStatus.set('error');
              this.errorMessage.set('instructor.builder.saveFailed');
            }
            return of(null);
          }),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe();
      return;
    }

    this.saveCurrentState(id)
      .pipe(
        tap((res) => {
          this.rowVersion.set(res.rowVersion);
          this.saveStatus.set('saved');
          this.saveSuccess.set(true);
          const now = new Date();
          this.lastSavedTime.set(
            now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          );
          setTimeout(() => this.saveSuccess.set(false), 3000);
          this.openCourseRoute();
        }),
        catchError((err) => {
          if (err?.status === 409) {
            this.isConflict.set(true);
            this.saveStatus.set('conflict');
            this.errorMessage.set('instructor.builder.concurrencyConflict');
          } else {
            this.saveStatus.set('error');
            this.errorMessage.set('instructor.builder.saveFailed');
          }
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  /**
   * Moves a freshly created course from `/instructor/courses/new` to its own builder URL. `courses/new` and
   * `courses/:id/builder` are separate route configs, so this swaps in a NEW component instance: it cancels every
   * `takeUntilDestroyed` pipe of this one and reloads the form from the server. It must therefore only run once
   * the typed state is persisted (never before `saveCurrentState` finishes), or subtitle, description and
   * curriculum typed on the "new" screen are silently lost. A no-op when the URL already names the course.
   */
  private openCourseRoute(): void {
    const id = this.courseId();
    if (!id || this.route.snapshot.paramMap.get('id') === id) return;
    void this.router.navigate(['/instructor/courses', id, 'builder'], { replaceUrl: true });
  }

  /** The optional trailer is not mid-upload / mid-processing (a selected trailer must have finished converting). */
  private readonly trailerSettled = computed(
    () =>
      this.trailerStatus() !== 'uploading' &&
      this.trailerStatus() !== 'processing' &&
      (!this.trailerMediaAssetId() || this.trailerStatus() === 'ready'),
  );

  /** The on-demand rule: at least one lesson and every lesson's video converted. */
  public readonly mediaReadyForReview = computed(() => {
    const episodes = this.sections().flatMap((section) => section.episodes);
    return (
      episodes.length > 0 &&
      episodes.every((episode) => episode.mediaAssetId && episode.videoStatus === 'ready') &&
      this.trailerSettled()
    );
  });

  /**
   * Whether the course may be sent for review from here. A Live or Hybrid course can go on its scheduled live classes alone (the server checks that a
   * future class with a usable room exists), so it needs no video lesson; an On-demand course still needs the video rule above. A Hybrid course that does
   * have lessons must still finish converting them (they are covered by `mediaReadyForReview`, never by this exemption).
   */
  public readonly reviewReady = computed(() => {
    if (this.mediaReadyForReview()) {
      return true;
    }
    const format = this.deliveryFormat();
    const noLessons = this.sections().every((section) => section.episodes.length === 0);
    return format !== null && format !== 'OnDemand' && noLessons && this.trailerSettled();
  });

  /** Called by the live tab as it learns the course's format (and again whenever the instructor changes it). */
  protected onDeliveryFormatChange(format: DeliveryFormat): void {
    this.deliveryFormat.set(format);
  }

  /**
   * The live tab rewrote the course row (delivery format, enrollment policy or attendee sync), which rotates the course's concurrency token on the
   * server. Take the new token — and only the token, so nothing the instructor has typed here is overwritten — otherwise the next save or submit is
   * refused with a false 409 and the live course can never be sent for review without a page reload.
   */
  protected onLiveCourseChanged(): void {
    const id = this.courseId();
    if (!id) {
      return;
    }
    this.courseApi
      .getCourseBuilder(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (course) => this.rowVersion.set(course.rowVersion),
        // The token could not be refreshed: say so now instead of failing the next save with no explanation.
        error: () => {
          this.isConflict.set(true);
          this.saveStatus.set('conflict');
          this.errorMessage.set('instructor.builder.concurrencyConflict');
        },
      });
  }

  /** Opens the "check & policy" tab; asks the server for the format first when it matters (a saved course with no lessons). */
  protected showPublishTab(): void {
    this.activeTab.set('publish');
    const id = this.courseId();
    if (id && this.deliveryFormat() === null && !this.mediaReadyForReview()) {
      this.loadDeliveryFormat(id).subscribe();
    }
  }

  /** Reads the course's delivery format from the live-schedule endpoint. A failed read falls back to the strict on-demand rule — never to "allowed". */
  private loadDeliveryFormat(id: string): Observable<DeliveryFormat> {
    return this.liveApi.getLiveSchedule(id).pipe(
      map((schedule) => schedule.deliveryFormat),
      catchError(() => of<DeliveryFormat>('OnDemand')),
      tap((format) => this.deliveryFormat.set(format)),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  public publishCourse(): void {
    if (!this.courseTitle().trim()) {
      this.errorMessage.set('instructor.builder.validation.titleRequired');
      this.saveStatus.set('error');
      return;
    }

    if (!this.categoryId()) {
      this.errorMessage.set('instructor.builder.validation.categoryRequired');
      this.saveStatus.set('error');
      return;
    }

    if (!this.reviewReady()) {
      const savedId = this.courseId();
      if (savedId && this.deliveryFormat() === null && this.sections().every((section) => section.episodes.length === 0)) {
        // No lessons: the course may be a live one. Ask the server what format it is, then evaluate the same rules again (the format is known by then).
        this.loadDeliveryFormat(savedId).subscribe(() => this.publishCourse());
        return;
      }
      this.errorMessage.set('instructor.builder.validation.mediaNotReady');
      this.saveStatus.set('error');
      return;
    }

    const id = this.courseId();
    this.saveStatus.set('saving');
    this.errorMessage.set(null);
    this.isConflict.set(false);

    if (!id) {
      this.courseApi
        .createCourse({
          title: this.courseTitle(),
          categoryId: this.categoryId(),
          level: this.courseLevel(),
          language: 'Thai',
          price: Number(this.coursePrice()),
        })
        .pipe(
          switchMap((created) => {
            this.courseId.set(created.id);
            return this.courseApi.getCourseBuilder(created.id);
          }),
          switchMap((builder) => {
            this.rowVersion.set(builder.rowVersion);
            return this.saveCurrentState(builder.id);
          }),
          switchMap((res) => {
            this.rowVersion.set(res.rowVersion);
            const createdId = this.courseId()!;
            return this.courseApi.submitCourseForReview(createdId);
          }),
          tap(() => {
            this.saveStatus.set('saved');
            this.router.navigate(['/instructor']);
          }),
          catchError((err) => {
            if (err?.status === 409) {
              this.isConflict.set(true);
              this.saveStatus.set('conflict');
              this.errorMessage.set('instructor.builder.concurrencyConflict');
            } else if (this.liveIssues.capture(err)) {
              // A Live course whose sessions have no meeting room is refused: show the live tab, which marks them.
              this.saveStatus.set('error');
              this.errorMessage.set('live.builder.meetingsNotReady');
              this.activeTab.set('live');
            } else {
              this.saveStatus.set('error');
              this.errorMessage.set('instructor.builder.saveFailed');
            }
            return of(null);
          }),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe();
      return;
    }

    this.saveCurrentState(id)
      .pipe(
        switchMap((res) => {
          this.rowVersion.set(res.rowVersion);
          return this.courseApi.submitCourseForReview(id);
        }),
        tap(() => {
          this.saveStatus.set('saved');
          this.router.navigate(['/instructor']);
        }),
        catchError((err) => {
          if (err?.status === 409) {
            this.isConflict.set(true);
            this.saveStatus.set('conflict');
            this.errorMessage.set('instructor.builder.concurrencyConflict');
          } else if (this.liveIssues.capture(err)) {
            this.saveStatus.set('error');
            this.errorMessage.set('live.builder.meetingsNotReady');
            this.activeTab.set('live');
          } else {
            this.saveStatus.set('error');
            this.errorMessage.set('instructor.builder.saveFailed');
          }
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }
}

