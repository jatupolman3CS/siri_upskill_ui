import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCaretDown,
  phosphorCheckCircle,
  phosphorLock,
  phosphorPlayCircle,
} from '@ng-icons/phosphor-icons/regular';

import { CourseDetailSection } from '../../catalog/data/course-api.models';
import { CourseProgressResponse } from '../data/learning-api.models';
import { DurationPipe } from '../../../core/i18n/duration.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-curriculum-sidebar',
  imports: [CommonModule, NgIcon, DurationPipe, TranslatePipe],
  templateUrl: './curriculum-sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCheckCircle,
      phosphorPlayCircle,
      phosphorCaretDown,
      phosphorLock,
    }),
  ],
})
export class CurriculumSidebar {
  readonly sections = input<readonly CourseDetailSection[]>([]);
  readonly activeEpisodeId = input<string>();
  readonly progress = input<CourseProgressResponse | null>();
  readonly isEnrolled = input(false);

  readonly selectEpisode = output<string>();
  readonly lockedEpisodeClicked = output<string>();

  private readonly expandedSections = signal<Set<string>>(new Set());

  protected isSectionExpanded(sectionId: string, index: number): boolean {
    if (this.expandedSections().size === 0 && index === 0) {
      return true;
    }
    return this.expandedSections().has(sectionId);
  }

  protected toggleSection(sectionId: string): void {
    this.expandedSections.update((set) => {
      const next = new Set(set);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  protected isEpisodeCompleted(episodeId: string): boolean {
    return this.progress()?.episodes.some((e) => e.episodeId === episodeId && e.isCompleted) ?? false;
  }

  protected onEpisodeClick(episodeId: string, isFreePreview: boolean): void {
    if (this.isEnrolled() || isFreePreview) {
      this.selectEpisode.emit(episodeId);
    } else {
      this.lockedEpisodeClicked.emit(episodeId);
    }
  }
}
