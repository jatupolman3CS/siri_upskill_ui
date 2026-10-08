import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorPlusCircle } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Button } from '../../../shared/button/button';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../live/instructor/studio-meta';
import { InstructorAnalyticsService } from '../analytics/instructor-analytics.service';
import { DashboardCourseTable } from './dashboard-course-table/dashboard-course-table';
import { DashboardKpiCards } from './dashboard-kpi-cards/dashboard-kpi-cards';
import { DashboardLiveCards } from './dashboard-live-cards/dashboard-live-cards';

/**
 * `/instructor` — the studio overview, bound to ONE call: `GET /api/analytics/instructor/dashboard/summary`. Every number,
 * every course and every status on screen comes from that response (the earlier version hard-coded revenue/students/rating
 * and listed the PUBLIC catalog's courses); a missing value shows "—" or is said in words, never a made-up figure.
 */
@Component({
  selector: 'app-instructor-dashboard-page',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    Button,
    EmptyState,
    Skeleton,
    DashboardKpiCards,
    DashboardLiveCards,
    DashboardCourseTable,
  ],
  templateUrl: './instructor-dashboard-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorPlusCircle })],
})
export class InstructorDashboardPage {
  private readonly analytics = inject(InstructorAnalyticsService);

  private readonly summaryResource = rxResource({ stream: () => this.analytics.getSummary('30d') });

  /** `.value()` throws once the resource is in `error` — every read goes through `hasValue()`. */
  protected readonly summary = computed(() => (this.summaryResource.hasValue() ? this.summaryResource.value() : null));
  protected readonly isLoading = computed(() => this.summaryResource.isLoading() && !this.summaryResource.hasValue());
  protected readonly hasError = computed(() => !this.summaryResource.hasValue() && this.summaryResource.status() === 'error');

  protected readonly kpis = computed(() => this.summary()?.kpis ?? null);
  /** `null` = the API did not send the list at all: show nothing rather than claiming "no courses". */
  protected readonly courses = computed(() => this.summary()?.courseSummaries ?? null);
  protected readonly nextSession = computed(() => this.summary()?.nextSession ?? null);
  protected readonly attendance = computed(() => this.summary()?.liveAttendance ?? []);

  constructor() {
    trackStudioMeta('instructor.dashboard.pageTitle', 'instructor.dashboard.pageDescription', () => '/instructor');
  }

  protected retry(): void {
    this.summaryResource.reload();
  }
}
