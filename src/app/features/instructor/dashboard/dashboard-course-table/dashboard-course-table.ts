import { CurrencyPipe, DecimalPipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowRight, phosphorEye, phosphorPencilSimple, phosphorStar } from '@ng-icons/phosphor-icons/regular';

import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { MediaUrlPipe } from '../../../../core/pipes/media-url.pipe';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { StatusChip } from '../../../live/instructor/ui/status-chip/status-chip';
import type { InstructorCourseSummaryItem } from '../../analytics/instructor-analytics.service';
import { courseStatusView, formatRating } from '../dashboard-format';

/** The signed-in instructor's own courses (`courseSummaries`) with their real status — never the public catalog. */
@Component({
  selector: 'app-dashboard-course-table',
  imports: [
    RouterLink,
    NgIcon,
    NgOptimizedImage,
    DecimalPipe,
    TranslatePipe,
    CurrencyThbPipe,
    MediaUrlPipe,
    EmptyState,
    StatusChip,
  ],
  templateUrl: './dashboard-course-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorArrowRight, phosphorEye, phosphorPencilSimple, phosphorStar })],
  host: { class: 'block' },
})
export class DashboardCourseTable {
  readonly courses = input<readonly InstructorCourseSummaryItem[]>([]);

  /** Row view-models: status badge + rating text are derived once per response, not on every change-detection pass. */
  protected readonly rows = computed(() =>
    this.courses().map((course) => ({
      course,
      status: courseStatusView(course.status),
      rating: course.ratingAverage === null ? null : formatRating(course.ratingAverage),
      isLive: course.deliveryFormat === 'Live' || course.deliveryFormat === 'Hybrid',
      isPublished: course.status === 'Published',
    })),
  );
}
