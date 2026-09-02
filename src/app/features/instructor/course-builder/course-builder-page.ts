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
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap, tap } from 'rxjs/operators';

import {
  AutosaveCourseCommand,
  CourseBuilderResponse,
  CourseLevel,
} from '../../catalog/data/course-api.models';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CategoryApiService } from '../../catalog/data/category-api.service';
import { CourseApiService } from '../../catalog/data/course-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';

export interface BuilderEpisode {
  id: string;
  title: string;
  durationSeconds: number;
  isFreePreview: boolean;
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
  protected readonly translationService = inject(TranslationService);
  private readonly seoService = inject(SeoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activeTab = signal<'basic' | 'curriculum' | 'publish'>('basic');
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

  // Form Fields
  protected readonly courseTitle = signal('หลักสูตรใหม่');
  protected readonly courseSubtitle = signal('');
  protected readonly courseDescription = signal('');
  protected readonly categoryId = signal<string>('');
  protected readonly coursePrice = signal<number>(1490);
  protected readonly comparePrice = signal<number | null>(2990);
  protected readonly courseLevel = signal<CourseLevel>('Beginner');
  protected readonly thumbnailUrl = signal<string>('');
  protected readonly seoTitle = signal<string>('');
  protected readonly seoDescription = signal<string>('');
  protected readonly outcomes = signal<string[]>([]);
  protected readonly requirements = signal<string[]>([]);
  protected readonly newOutcome = signal<string>('');
  protected readonly newRequirement = signal<string>('');

  // Curriculum Sections
  protected readonly sections = signal<BuilderSection[]>([
    {
      id: 'sec-temp-1',
      title: 'บทนำและภาพรวม',
      episodes: [
        { id: 'ep-temp-1', title: '1. ยินดีต้อนรับสู่หลักสูตร', durationSeconds: 300, isFreePreview: true },
        { id: 'ep-temp-2', title: '2. แนะนำเครื่องมือที่ต้องใช้', durationSeconds: 450, isFreePreview: false },
      ],
    },
  ]);

  protected readonly sectionDropListIds = computed(() => {
    return this.sections().map((_, idx) => `ep-drop-list-${idx}`);
  });

  ngOnInit(): void {
    this.seoService.set({
      title: 'Course Studio Builder | SIRI UpSkill',
      description: 'เครื่องมือสร้างและจัดการหลักสูตร',
      path: '/instructor/courses/builder',
      robots: 'noindex',
    });

    this.setupAutosavePipeline();

    this.categoryApi
      .getCategoryTree()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tree) => {
          const list: readonly CategoryTreeNode[] = Array.isArray(tree) ? tree : ((tree as any)?.items ?? []);
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
        switchMap(() => {
          const id = this.courseId();
          if (!id || this.saveStatus() === 'conflict' || this.isLoading()) {
            return of(null);
          }
          this.saveStatus.set('saving');
          this.errorMessage.set(null);
          const command = this.buildAutosaveCommand();
          return this.courseApi.autosaveCourse(id, command).pipe(
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

    if (course.sections.length > 0) {
      this.sections.set(
        course.sections.map((s) => ({
          id: s.id,
          title: s.title,
          episodes: s.episodes.map((e) => ({
            id: e.id,
            title: e.title,
            durationSeconds: e.durationSeconds ?? 300,
            isFreePreview: e.isFreePreview,
          })),
        }))
      );
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
        title: `ส่วนที่ ${count}: หัวข้อการเรียนรู้ใหม่`,
        episodes: [
          {
            id: `ep-temp-${Date.now()}`,
            title: `บทเรียนที่ 1`,
            durationSeconds: 300,
            isFreePreview: false,
          },
        ],
      },
    ]);
    this.announceMessage(this.translationService.t('instructor.builder.curriculum.addSection'));
    this.triggerAutosave();
  }

  public removeSection(index: number): void {
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
              title: `บทเรียนที่ ${newEpNum}`,
              durationSeconds: 400,
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
        })),
      })),
      rowVersion: this.rowVersion(),
    };
  }

  // --- Save / Publish Pipelines (Clean RxJS switchMap) ---

  public saveCourse(): void {
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
            this.router.navigate(['/instructor/courses', created.id, 'builder'], {
              replaceUrl: true,
            });
            return this.courseApi.getCourseBuilder(created.id);
          }),
          switchMap((builder) => {
            this.rowVersion.set(builder.rowVersion);
            const command = this.buildAutosaveCommand();
            return this.courseApi.autosaveCourse(builder.id, command);
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

    const command = this.buildAutosaveCommand();
    this.courseApi
      .autosaveCourse(id, command)
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

  public publishCourse(): void {
    if (!this.categoryId()) {
      this.errorMessage.set('instructor.builder.validation.categoryRequired');
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
            const command = this.buildAutosaveCommand();
            return this.courseApi.autosaveCourse(builder.id, command);
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

    const command = this.buildAutosaveCommand();
    this.courseApi
      .autosaveCourse(id, command)
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

