import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorChartBar,
  phosphorDownloadSimple,
  phosphorEye,
  phosphorGraduationCap,
  phosphorTrendUp,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import {
  InstructorAnalyticsService,
  InstructorCourseOption,
  InstructorDropOffStat,
  InstructorStudentProgress,
} from './instructor-analytics.service';

export type DropOffData = InstructorDropOffStat;
export type StudentProgressItem = InstructorStudentProgress;

@Component({
  selector: 'app-instructor-analytics-page',
  imports: [CommonModule, FormsModule, NgIcon, TranslatePipe],
  templateUrl: './instructor-analytics-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorChartBar,
      phosphorTrendUp,
      phosphorUsers,
      phosphorGraduationCap,
      phosphorDownloadSimple,
      phosphorEye,
    }),
  ],
})
export class InstructorAnalyticsPage implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly translation = inject(TranslationService);
  private readonly analyticsService = inject(InstructorAnalyticsService);

  protected readonly selectedTimeRange = signal<'7d' | '30d' | '90d'>('30d');
  protected readonly selectedCourse = signal('all');
  protected readonly isLoading = signal(false);

  protected readonly totalViews = signal(0);
  protected readonly totalWatchMinutes = signal(0);
  protected readonly avgCompletionRate = signal(0);

  protected readonly dropOffStats = signal<DropOffData[]>([]);
  protected readonly students = signal<StudentProgressItem[]>([]);
  protected readonly courses = signal<InstructorCourseOption[]>([]);

  ngOnInit(): void {
    this.seoService.set({
      title: this.translation.t('instructor.analytics.pageTitle'),
      description: this.translation.t('instructor.analytics.pageDescription'),
      path: '/instructor/analytics',
      robots: 'noindex',
    });

    this.loadAnalytics();
  }

  protected setTimeRange(range: '7d' | '30d' | '90d'): void {
    this.selectedTimeRange.set(range);
    this.loadAnalytics();
  }

  protected setCourse(courseId: string): void {
    this.selectedCourse.set(courseId);
    this.loadAnalytics();
  }

  private loadAnalytics(): void {
    this.isLoading.set(true);
    this.analyticsService
      .getSummary(this.selectedTimeRange(), this.selectedCourse())
      .subscribe({
        next: (data) => {
          this.totalViews.set(data.totalViews ?? 0);
          this.totalWatchMinutes.set(data.totalWatchMinutes ?? 0);
          this.avgCompletionRate.set(data.avgCompletionRate ?? 0);
          this.dropOffStats.set(data.dropOffStats ? [...data.dropOffStats] : []);
          this.students.set(data.students ? [...data.students] : []);
          this.courses.set(data.courses ? [...data.courses] : []);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        },
      });
  }

  protected exportCsv(): void {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Name,Email,Course,Progress,Completed,Total,LastActive']
        .concat(
          this.students().map(
            (s) =>
              `"${s.name ?? ''}","${s.email ?? ''}","${s.courseTitle}",${s.progressPercent}%,${s.completedEpisodes},${s.totalEpisodes},"${s.lastActiveAtUtc ?? ''}"`
          )
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `students_progress_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
