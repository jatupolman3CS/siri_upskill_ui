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
import { CourseApiService } from '../../catalog/data/course-api.service';
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
  private readonly courseApi = inject(CourseApiService);
  private readonly seoService = inject(SeoService);

  protected readonly isLoading = signal(true);
  protected readonly activeFilter = signal<'all' | 'inProgress' | 'completed'>('all');
  protected readonly enrollments = signal<readonly EnrichedEnrollment[]>([]);

  protected readonly filteredEnrollments = computed(() => {
    const list = this.enrollments();
    const filter = this.activeFilter();

    if (filter === 'inProgress') {
      return list.filter((e) => e.progressPercentage < 100);
    }
    if (filter === 'completed') {
      return list.filter((e) => e.progressPercentage >= 100);
    }
    return list;
  });

  protected readonly inProgressCount = computed(
    () => this.enrollments().filter((e) => e.progressPercentage < 100).length
  );

  protected readonly completedCount = computed(
    () => this.enrollments().filter((e) => e.progressPercentage >= 100).length
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

    this.learningApi.getMyEnrollments().subscribe({
      next: (res) => {
        // Fetch courses to enrich title & thumbnail
        this.courseApi.searchCourses({ page: 1, pageSize: 50 }).subscribe({
          next: (coursesRes) => {
            const courseMap = new Map(coursesRes.results.items.map((c) => [c.id, c]));

            const enriched: EnrichedEnrollment[] = res.items.map((e) => {
              const matchedCourse = courseMap.get(e.courseId);
              return {
                ...e,
                title: matchedCourse?.title ?? e.courseTitle ?? 'หลักสูตรออนไลน์',
                slug: matchedCourse?.slug ?? e.courseSlug ?? e.courseId,
                thumbnailUrl: matchedCourse?.thumbnailUrl ?? e.courseThumbnailUrl ?? undefined,
                instructorName: matchedCourse?.instructorDisplayName ?? e.instructorName ?? 'ผู้สอน SIRI UpSkill',
              };
            });

            this.enrollments.set(enriched);
            this.isLoading.set(false);
          },
          error: () => {
            // Fallback enriched
            const basicEnriched: EnrichedEnrollment[] = res.items.map((e) => ({
              ...e,
              title: e.courseTitle ?? 'หลักสูตรออนไลน์',
              slug: e.courseSlug ?? e.courseId,
              thumbnailUrl: e.courseThumbnailUrl ?? undefined,
              instructorName: e.instructorName ?? 'ผู้สอน SIRI UpSkill',
            }));
            this.enrollments.set(basicEnriched);
            this.isLoading.set(false);
          },
        });
      },
      error: () => {
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

