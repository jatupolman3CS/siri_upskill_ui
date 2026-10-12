import { CommonModule, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';
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
import type { MyUpcomingSessionItem } from '../../live/data/live-learner.models';
import { LiveLearnerApiService } from '../../live/data/live-learner-api.service';
import { clockOffsetMs, nextBoundaryDelayMs } from '../../live/learner/live-clock';
import { LiveNextSessionChip } from '../../live/learner/live-next-session-chip/live-next-session-chip';

import { notConfiguredMessageKey } from '../../../core/http/provider-errors';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';

interface EnrichedEnrollment extends EnrollmentItemResponse {
  readonly title: string;
  readonly slug: string;
  readonly thumbnailUrl?: string;
  readonly instructorName?: string;
}

@Component({
  selector: 'app-my-courses-page',
  imports: [CommonModule, NgOptimizedImage, RouterLink, NgIcon, TranslatePipe, Skeleton, LiveNextSessionChip],
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
  private readonly liveApi = inject(LiveLearnerApiService);

  private readonly seoService = inject(SeoService);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);

  private readonly liveOffsetMs = signal(0);

  /**
   * My upcoming live sessions across all courses (appendix B.2). Decorative on this page: if the call fails the cards
   * simply show no "next session" strip — `hasValue()` is checked before every read because `resource().value()` throws
   * while the resource is in the error state.
   */
  private readonly upcomingResource = rxResource({
    stream: () =>
      this.liveApi.getMyUpcoming(10).pipe(tap((response) => this.liveOffsetMs.set(clockOffsetMs(response.serverTimeUtc)))),
  });

  /** The soonest upcoming session of each course (the API list is not relied on to be ordered). */
  protected readonly nextLiveByCourse = computed<ReadonlyMap<string, MyUpcomingSessionItem>>(() => {
    const byCourse = new Map<string, MyUpcomingSessionItem>();
    if (!this.upcomingResource.hasValue()) {
      return byCourse;
    }
    for (const item of this.upcomingResource.value().items) {
      const current = byCourse.get(item.courseId);
      if (!current || Date.parse(item.startsAtUtc) < Date.parse(current.startsAtUtc)) {
        byCourse.set(item.courseId, item);
      }
    }
    return byCourse;
  });

  constructor() {
    // Refetch exactly when the server's answer can change (window opens / session starts / ends), never by guessing.
    effect((onCleanup) => {
      if (!this.upcomingResource.hasValue()) {
        return;
      }
      const delay = nextBoundaryDelayMs(this.upcomingResource.value().items, this.liveOffsetMs());
      if (delay === null) {
        return;
      }
      const handle = setTimeout(() => this.upcomingResource.reload(), delay);
      onCleanup(() => clearTimeout(handle));
    });
  }

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
      title: this.translation.t('myCourses.pageTitle'),
      description: this.translation.t('myCourses.pageDescription'),
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
          error: (error: unknown) => {
            // The server says certificates are not available yet on this deployment: tell the learner instead of
            // opening the verify page, which would not give them the PDF either. The button stays as the retry.
            const notConfiguredKey = notConfiguredMessageKey(error);
            if (notConfiguredKey) {
              this.toast.error(this.translation.t(notConfiguredKey));
              return;
            }
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

