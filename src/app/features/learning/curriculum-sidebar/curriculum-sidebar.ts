import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
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

@Component({
  selector: 'app-curriculum-sidebar',
  imports: [CommonModule, NgIcon, DurationPipe],
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
  @Input() sections: readonly CourseDetailSection[] = [];
  @Input() activeEpisodeId?: string;
  @Input() progress?: CourseProgressResponse | null;
  @Input() isEnrolled = false;

  @Output() readonly selectEpisode = new EventEmitter<string>();

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
    return this.progress?.episodes.some((e) => e.episodeId === episodeId && e.isCompleted) ?? false;
  }

  protected onEpisodeClick(episodeId: string, isFreePreview: boolean): void {
    if (this.isEnrolled || isFreePreview) {
      this.selectEpisode.emit(episodeId);
    }
  }
}
