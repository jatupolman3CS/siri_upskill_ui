import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorBookOpen,
  phosphorCertificate,
  phosphorClock,
  phosphorGraduationCap,
  phosphorPlayCircle,
  phosphorUser,
} from '@ng-icons/phosphor-icons/regular';

import { EnrollmentItemResponse } from '../data/learning-api.models';
import { LearningApiService } from '../data/learning-api.service';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';

interface EnrichedEnrollment extends EnrollmentItemResponse {
  readonly title: string;
  readonly slug: string;
  readonly thumbnailUrl?: string;
  readonly instructorName?: string;
}

@Component({
  selector: 'app-my-courses-page',
  imports: [CommonModule, RouterLink, NgIcon, TranslatePipe, Skeleton],
  templateUrl: './my-courses-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorPlayCircle,
      phosphorGraduationCap,
      phosphorCertificate,
      phosphorBookOpen,
      phosphorClock,
      phosphorUser,
      phosphorArrowRight,
    }),
  ],
})
export class MyCoursesPage implements OnInit {
  private readonly learningApi = inject(LearningApiService);

  private readonly seoService = inject(SeoService);

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly activeFilter = signal<'all' | 'inProgress' | 'completed'>('all');
  protected readonly enrollments = signal<readonly EnrichedEnrollment[]>([]);

  protected readonly filteredEnrollments = computed(() => {
    const list = this.enrollments();
    const filter = this.activeFilter();

    if (filter === 'inProgress') {
      return list.filter((e) => e.progressPercent < 100);
    }
    if (filter === 'completed') {
      return list.filter((e) => e.progressPercent >= 100);
    }
    return list;
  });

  protected readonly inProgressCount = computed(
    () => this.enrollments().filter((e) => e.progressPercent < 100).length
  );

  protected readonly completedCount = computed(
    () => this.enrollments().filter((e) => e.progressPercent >= 100).length
  );

  ngOnInit(): void {
    this.seoService.set({
      title: 'คอร์สของฉัน | SIRI UpSkill',
      description: 'รายการคอร์สเรียนทั้งหมดที่คุณลงทะเบียนไว้ ความคืบหน้า และใบประกาศนียบัตร',
      path: '/my-courses',
      robots: 'noindex',
    });

    this.loadEnrollments();
  }

  private loadEnrollments(): void {
    this.isLoading.set(true);

    this.learningApi.getAllMyEnrollments().subscribe({
      next: (items) => {
        this.enrollments.set(items.map((enrollment) => ({
          ...enrollment,
          title: enrollment.courseTitle ?? '',
          slug: enrollment.courseSlug ?? '',
          thumbnailUrl: enrollment.courseThumbnailUrl ?? undefined,
          instructorName: enrollment.instructorName ?? '',
        })));
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.isLoading.set(false);
      },
    });
  }
  protected downloadCertificate(enrollmentId: string): void {
    this.learningApi.getCertificateByEnrollment(enrollmentId).subscribe({
      next: (cert) => {
        this.learningApi.downloadCertificatePdf(cert.id).subscribe({
          next: (blob) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Certificate-${cert.serialNo}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
          },
          error: () => {
            window.open(`/certificates/verify/${cert.verifyCode}`, '_blank');
          },
        });
      },
      error: () => {
        // Intentional no-op: no certificate record was found for this
        // enrollment, so there is nothing to download or fall back to.
      },
    });
  }
}

