import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowClockwise,
  phosphorArrowLeft,
  phosphorCheckCircle,
  phosphorFloppyDisk,
  phosphorPlayCircle,
  phosphorPlus,
  phosphorSparkle,
  phosphorTrash,
  phosphorUploadSimple,
  phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';

import {
  AutosaveCourseCommand,
  CourseBuilderResponse,
  CourseLevel,
} from '../../catalog/data/course-api.models';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CategoryApiService } from '../../catalog/data/category-api.service';
import { CourseApiService } from '../../catalog/data/course-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';

interface BuilderEpisode {
  id: string;
  title: string;
  durationSeconds: number;
  isFreePreview: boolean;
}

interface BuilderSection {
  id: string;
  title: string;
  episodes: BuilderEpisode[];
}

@Component({
  selector: 'app-course-builder-page',
  imports: [CommonModule, FormsModule, RouterLink, NgIcon, TranslatePipe],
  templateUrl: './course-builder-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowClockwise,
      phosphorArrowLeft,
      phosphorFloppyDisk,
      phosphorPlus,
      phosphorTrash,
      phosphorPlayCircle,
      phosphorCheckCircle,
      phosphorUploadSimple,
      phosphorSparkle,
      phosphorWarningCircle,
    }),
  ],
})
export class CourseBuilderPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseApi = inject(CourseApiService);
  private readonly categoryApi = inject(CategoryApiService);
  private readonly seoService = inject(SeoService);

  protected readonly activeTab = signal<'basic' | 'curriculum' | 'publish'>('basic');
  protected readonly isSaving = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly saveSuccess = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isConflict = signal(false);

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
  protected readonly outcomes = signal<string[]>(['เข้าใจพื้นฐานและโครงสร้าง', 'สามารถนำไปประยุกต์ใช้งานจริง']);
  protected readonly requirements = signal<string[]>(['คอมพิวเตอร์และอินเทอร์เน็ต']);

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

  ngOnInit(): void {
    this.seoService.set({
      title: 'Course Studio Builder | SIRI UpSkill',
      description: 'เครื่องมือสร้างและจัดการหลักสูตร',
      path: '/instructor/courses/builder',
      robots: 'noindex',
    });

    this.categoryApi.getCategoryTree().subscribe({
      next: (tree) => {
        const flat: CategoryTreeNode[] = [];
        const flatten = (nodes: readonly CategoryTreeNode[]) => {
          for (const node of nodes) {
            flat.push(node);
            if (node.children?.length) {
              flatten(node.children);
            }
          }
        };
        flatten(tree);
        this.categories.set(flat);
        if (!this.categoryId() && flat.length > 0) {
          this.categoryId.set(flat[0].id);
        }
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

    this.courseApi.getCourseBuilder(id).subscribe({
      next: (course) => {
        this.isLoading.set(false);
        this.populateFromBuilder(course);
      },
      error: () => {
        this.isLoading.set(false);
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
    if (course.outcomes.length > 0) this.outcomes.set([...course.outcomes]);
    if (course.requirements.length > 0) this.requirements.set([...course.requirements]);

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

  protected addSection(): void {
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
  }

  protected removeSection(index: number): void {
    this.sections.update((list) => list.filter((_, idx) => idx !== index));
  }

  protected addEpisode(sectionIndex: number): void {
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
  }

  protected removeEpisode(sectionIndex: number, episodeIndex: number): void {
    this.sections.update((list) =>
      list.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        return {
          ...sec,
          episodes: sec.episodes.filter((_, epIdx) => epIdx !== episodeIndex),
        };
      })
    );
  }

  protected toggleFreePreview(sectionIndex: number, episodeIndex: number): void {
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
  }

  private buildAutosaveCommand(): AutosaveCourseCommand {
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
      seoTitle: this.courseTitle(),
      seoDescription: this.courseSubtitle() || null,
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

  protected saveCourse(): void {
    const id = this.courseId();
    if (!id) {
      this.isSaving.set(true);
      this.saveSuccess.set(false);
      this.errorMessage.set(null);
      this.isConflict.set(false);

      this.courseApi
        .createCourse({
          title: this.courseTitle(),
          categoryId: this.categoryId(),
          level: this.courseLevel(),
          language: 'Thai',
          price: Number(this.coursePrice()),
        })
        .subscribe({
          next: (created) => {
            this.courseId.set(created.id);
            this.router.navigate(['/instructor/courses', created.id, 'builder'], { replaceUrl: true });
            // Fetch builder to obtain valid rowVersion
            this.courseApi.getCourseBuilder(created.id).subscribe({
              next: (builder) => {
                this.rowVersion.set(builder.rowVersion);
                const command = this.buildAutosaveCommand();
                this.courseApi.autosaveCourse(created.id, command).subscribe({
                  next: (res) => {
                    this.isSaving.set(false);
                    this.rowVersion.set(res.rowVersion);
                    this.saveSuccess.set(true);
                    setTimeout(() => this.saveSuccess.set(false), 3000);
                  },
                  error: () => {
                    this.isSaving.set(false);
                    this.errorMessage.set('instructor.builder.saveFailed');
                  },
                });
              },
              error: () => {
                this.isSaving.set(false);
                this.errorMessage.set('instructor.builder.saveFailed');
              },
            });
          },
          error: () => {
            this.isSaving.set(false);
            this.errorMessage.set('instructor.builder.saveFailed');
          },
        });
      return;
    }

    this.isSaving.set(true);
    this.saveSuccess.set(false);
    this.errorMessage.set(null);
    this.isConflict.set(false);

    const command = this.buildAutosaveCommand();
    this.courseApi.autosaveCourse(id, command).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.rowVersion.set(res.rowVersion);
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (err) => {
        this.isSaving.set(false);
        if (err.status === 409) {
          this.isConflict.set(true);
          this.errorMessage.set('instructor.builder.concurrencyConflict');
        } else {
          this.errorMessage.set('instructor.builder.saveFailed');
        }
      },
    });
  }

  protected publishCourse(): void {
    const id = this.courseId();
    if (!id) {
      this.isSaving.set(true);
      this.courseApi
        .createCourse({
          title: this.courseTitle(),
          categoryId: this.categoryId(),
          level: this.courseLevel(),
          language: 'Thai',
          price: Number(this.coursePrice()),
        })
        .subscribe({
          next: (created) => {
            this.courseId.set(created.id);
            this.courseApi.getCourseBuilder(created.id).subscribe({
              next: (builder) => {
                this.rowVersion.set(builder.rowVersion);
                const command = this.buildAutosaveCommand();
                this.courseApi.autosaveCourse(created.id, command).subscribe({
                  next: (res) => {
                    this.rowVersion.set(res.rowVersion);
                    this.courseApi.submitCourseForReview(created.id).subscribe({
                      next: () => {
                        this.isSaving.set(false);
                        this.router.navigate(['/instructor']);
                      },
                      error: () => {
                        this.isSaving.set(false);
                        this.errorMessage.set('instructor.builder.saveFailed');
                      },
                    });
                  },
                  error: () => {
                    this.isSaving.set(false);
                    this.errorMessage.set('instructor.builder.saveFailed');
                  },
                });
              },
              error: () => {
                this.isSaving.set(false);
                this.errorMessage.set('instructor.builder.saveFailed');
              },
            });
          },
          error: () => {
            this.isSaving.set(false);
            this.errorMessage.set('instructor.builder.saveFailed');
          },
        });
      return;
    }

    this.isSaving.set(true);
    const command = this.buildAutosaveCommand();
    this.courseApi.autosaveCourse(id, command).subscribe({
      next: (res) => {
        this.rowVersion.set(res.rowVersion);
        this.courseApi.submitCourseForReview(id).subscribe({
          next: () => {
            this.isSaving.set(false);
            this.router.navigate(['/instructor']);
          },
          error: (err) => {
            this.isSaving.set(false);
            if (err.status === 409) {
              this.isConflict.set(true);
              this.errorMessage.set('instructor.builder.concurrencyConflict');
            } else {
              this.errorMessage.set('instructor.builder.saveFailed');
            }
          },
        });
      },
      error: (err) => {
        this.isSaving.set(false);
        if (err.status === 409) {
          this.isConflict.set(true);
          this.errorMessage.set('instructor.builder.concurrencyConflict');
        } else {
          this.errorMessage.set('instructor.builder.saveFailed');
        }
      },
    });
  }
}
