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

import { SeoService } from '../../../core/seo/seo.service';

export interface DropOffData {
  episodeNumber: number;
  title: string;
  viewersCount: number;
  completionRate: number;
}

export interface StudentProgressItem {
  id: string;
  name: string;
  email: string;
  courseTitle: string;
  progressPercent: number;
  completedEpisodes: number;
  totalEpisodes: number;
  lastActiveAtUtc: string;
}

@Component({
  selector: 'app-instructor-analytics-page',
  imports: [CommonModule, FormsModule, NgIcon],
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

  protected readonly selectedTimeRange = signal<'7d' | '30d' | '90d'>('30d');
  protected readonly selectedCourse = signal('all');

  protected readonly totalViews = signal(14820);
  protected readonly totalWatchMinutes = signal(95400);
  protected readonly avgCompletionRate = signal(78.5);

  protected readonly dropOffStats = signal<DropOffData[]>([
    { episodeNumber: 1, title: 'บทที่ 1: บทนำและการติดตั้งสภาพแวดล้อม', viewersCount: 420, completionRate: 98 },
    { episodeNumber: 2, title: 'บทที่ 2: สถาปัตยกรรม Clean Architecture', viewersCount: 405, completionRate: 92 },
    { episodeNumber: 3, title: 'บทที่ 3: Domain Entities & Invariants', viewersCount: 388, completionRate: 88 },
    { episodeNumber: 4, title: 'บทที่ 4: EF Core & Interceptors', viewersCount: 365, completionRate: 82 },
    { episodeNumber: 5, title: 'บทที่ 5: CQRS & MediatR vs Services', viewersCount: 340, completionRate: 76 },
    { episodeNumber: 6, title: 'บทที่ 6: Real-time Video DRM & Player', viewersCount: 322, completionRate: 74 },
  ]);

  protected readonly students = signal<StudentProgressItem[]>([
    {
      id: 'st-1',
      name: 'กิตติศักดิ์ พรหมมินทร์',
      email: 'kittisak.p@example.com',
      courseTitle: 'Full-Stack Web Development with Angular & .NET 10',
      progressPercent: 100,
      completedEpisodes: 24,
      totalEpisodes: 24,
      lastActiveAtUtc: '2026-08-21T04:10:00Z',
    },
    {
      id: 'st-2',
      name: 'ชลธิชา อภิสิทธิ์',
      email: 'chonticha.a@example.com',
      courseTitle: 'Full-Stack Web Development with Angular & .NET 10',
      progressPercent: 75,
      completedEpisodes: 18,
      totalEpisodes: 24,
      lastActiveAtUtc: '2026-08-20T17:30:00Z',
    },
    {
      id: 'st-3',
      name: 'ปิยะวัฒน์ เจริญสุข',
      email: 'piyawat.c@example.com',
      courseTitle: 'Building Production AI Agents with Semantic Kernel',
      progressPercent: 45,
      completedEpisodes: 7,
      totalEpisodes: 16,
      lastActiveAtUtc: '2026-08-19T11:20:00Z',
    },
  ]);

  ngOnInit(): void {
    this.seoService.set({
      title: 'การวิเคราะห์และสถิติผู้เรียน | Instructor Studio',
      description: 'วิเคราะห์ยอดผู้เรียน อัตราการดูจบ และสถิติบทเรียน',
      path: '/instructor/analytics',
      robots: 'noindex',
    });
  }

  protected exportCsv(): void {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Name,Email,Course,Progress,Completed,Total,LastActive']
        .concat(
          this.students().map(
            (s) =>
              `"${s.name}","${s.email}","${s.courseTitle}",${s.progressPercent}%,${s.completedEpisodes},${s.totalEpisodes},"${s.lastActiveAtUtc}"`
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
