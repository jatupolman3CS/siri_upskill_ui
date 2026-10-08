import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import type { InstructorAnalyticsSummaryResponse } from '../analytics/instructor-analytics.service';
import { courseStatusView, formatChangePercent, formatRating } from './dashboard-format';
import { InstructorDashboardPage } from './instructor-dashboard-page';

registerLocaleData(localeTh);

const SUMMARY_URL = '/api/analytics/instructor/dashboard/summary';

function summary(overrides: Partial<InstructorAnalyticsSummaryResponse> = {}): InstructorAnalyticsSummaryResponse {
  return {
    totalViews: 0,
    totalWatchMinutes: 0,
    avgCompletionRate: 0,
    totalRevenue: 0,
    totalEnrollments: 0,
    dropOffStats: [],
    students: [],
    courses: [],
    kpis: {
      periodKey: '2026-10',
      previousPeriodKey: '2026-09',
      netRevenueThisMonth: 7321.5,
      netRevenuePreviousMonth: 6000,
      netRevenueChangePercent: 22.0,
      totalStudents: 417,
      newStudentsLast7Days: 9,
      publishedCourseCount: 2,
      totalCourseCount: 3,
      ratingAverage: 4.3,
      ratingCount: 51,
    },
    courseSummaries: [
      {
        courseId: 'c1',
        title: 'Excel Pro',
        slug: 'excel-pro',
        status: 'Published',
        deliveryFormat: 'Hybrid',
        price: 1490,
        enrollmentCount: 300,
        ratingAverage: 4.5,
        ratingCount: 40,
        thumbnailUrl: null,
      },
      {
        courseId: 'c2',
        title: 'Draft course',
        slug: 'draft-course',
        status: 'Draft',
        deliveryFormat: 'OnDemand',
        price: 990,
        enrollmentCount: 0,
        ratingAverage: null,
        ratingCount: 0,
        thumbnailUrl: null,
      },
    ],
    nextSession: null,
    liveAttendance: [],
    ...overrides,
  };
}

describe('InstructorDashboardPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor', component: InstructorDashboardPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function open(body: InstructorAnalyticsSummaryResponse | 'error'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor', InstructorDashboardPage);
    await settle();
    const req = httpMock.expectOne((r) => r.url === SUMMARY_URL);
    if (body === 'error') {
      req.flush({}, { status: 500, statusText: 'Server Error' });
    } else {
      req.flush(body);
    }
    await settle();
  }

  const root = () => harness.routeNativeElement as HTMLElement;
  const text = () => root().textContent ?? '';

  it('makes ONE call — the summary — and never queries the public course catalog', async () => {
    await open(summary());
    httpMock.expectNone((r) => r.url.includes('/catalog/courses/search'));
  });

  it('shows every KPI from the response (not the old hard-coded figures)', async () => {
    await open(summary());

    expect(text()).toContain('7,321.50');
    expect(text()).toContain('+22.0% vs last month');
    expect(text()).toContain('417');
    expect(text()).toContain('+9 in the last 7 days');
    expect(text()).toContain('of 3 in total');
    expect(text()).toContain('4.3');
    expect(text()).toContain('from 51 review(s)');
    // the previous version's fabricated numbers must be gone
    for (const fake of ['45,200', '14.5%', '1,280', '+82', '184']) {
      expect(text()).not.toContain(fake);
    }
  });

  it('renders null values as "—" / "No reviews yet" instead of inventing a number', async () => {
    await open(
      summary({
        kpis: {
          periodKey: '2026-10',
          previousPeriodKey: '2026-09',
          netRevenueThisMonth: 0,
          netRevenuePreviousMonth: 0,
          netRevenueChangePercent: null,
          totalStudents: 0,
          newStudentsLast7Days: 0,
          publishedCourseCount: 0,
          totalCourseCount: 0,
          ratingAverage: null,
          ratingCount: 0,
        },
      }),
    );

    expect(text()).toContain('No reviews yet');
    expect(text()).toContain('No revenue last month to compare with');
    expect(text()).not.toContain('NaN');
    expect(text()).not.toContain('null');
  });

  it('a missing kpis block (null) renders dashes, not zeros that look real', async () => {
    await open(summary({ kpis: null }));
    expect(root().querySelectorAll('article').length).toBe(4);
    expect(text()).not.toContain('฿0');
    expect(text()).not.toContain('NaN');
  });

  it('lists only the instructor\'s own courses, with the real status and a rating or "No reviews yet" per row', async () => {
    await open(summary());

    const rows = root().querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Excel Pro');
    expect(rows[0].textContent).toContain('Published');
    expect(rows[0].textContent).toContain('Hybrid');
    expect(rows[0].textContent).toContain('4.5');
    expect(rows[1].textContent).toContain('Draft course');
    expect(rows[1].textContent).toContain('Draft');
    expect(rows[1].textContent).not.toContain('Published');
    expect(rows[1].textContent).toContain('No reviews yet');
    // only a Published course has a public page to view
    expect(rows[0].querySelector('a[href="/courses/excel-pro"]')).not.toBeNull();
    expect(rows[1].querySelector('a[href="/courses/draft-course"]')).toBeNull();
    expect(rows[1].querySelector('a[href="/instructor/courses/c2/builder"]')).not.toBeNull();
  });

  it('with no courses: an empty state that points to creating one', async () => {
    await open(summary({ courseSummaries: [] }));
    expect(text()).toContain('You have no courses yet');
    expect(root().querySelector('tbody')).toBeNull();
  });

  it('when the API sends no course list at all, it does not claim "no courses" — the table is simply absent', async () => {
    await open(summary({ courseSummaries: null }));
    expect(text()).not.toContain('You have no courses yet');
    expect(root().querySelector('app-dashboard-course-table')).toBeNull();
    expect(root().querySelectorAll('article').length).toBe(4);
  });

  it('next session: shows it with a link to its page, and a warning when the room is not usable', async () => {
    await open(
      summary({
        nextSession: {
          sessionId: 's9',
          courseId: 'c1',
          courseTitle: 'Excel Pro',
          title: 'Session 3: pivots',
          startsAtUtc: '2026-10-09T03:00:00Z',
          endsAtUtc: '2026-10-09T05:00:00Z',
          displayState: 'Upcoming',
          expectedLearners: 14,
          meetingUsable: false,
        },
      }),
    );

    expect(text()).toContain('Session 3: pivots');
    expect(text()).toContain('14 learner(s) invited');
    expect(text()).toContain('10:00–12:00');
    expect(text()).toContain('no usable room');
    expect(root().querySelector('a[href="/instructor/sessions/s9"]')).not.toBeNull();
  });

  it('next session with a usable room has no warning', async () => {
    await open(
      summary({
        nextSession: {
          sessionId: 's9',
          courseId: 'c1',
          courseTitle: 'Excel Pro',
          title: 'Session 3',
          startsAtUtc: '2026-10-09T03:00:00Z',
          endsAtUtc: '2026-10-09T05:00:00Z',
          displayState: 'Live',
          expectedLearners: 14,
          meetingUsable: true,
        },
      }),
    );
    expect(text()).not.toContain('no usable room');
    expect(text()).toContain('Live now');
  });

  it('no next session -> says so plainly', async () => {
    await open(summary({ nextSession: null }));
    expect(text()).toContain('No upcoming live session.');
  });

  it('recent attendance: shows joined/expected and the rate, with "—" when the rate is null', async () => {
    await open(
      summary({
        liveAttendance: [
          { sessionId: 'a1', courseId: 'c1', courseTitle: 'Excel Pro', title: 'Session 1', startsAtUtc: '2026-10-01T03:00:00Z', expectedLearners: 20, joinedLearners: 15, attendanceRatePercent: 75 },
          { sessionId: 'a2', courseId: 'c1', courseTitle: 'Excel Pro', title: 'Session 2', startsAtUtc: '2026-10-02T03:00:00Z', expectedLearners: 0, joinedLearners: 0, attendanceRatePercent: null },
        ],
      }),
    );

    expect(text()).toContain('Joined 15/20');
    expect(text()).toContain('75%');
    expect(text()).toContain('Joined 0/0');
    expect(text()).not.toContain('NaN');
  });

  it('a failed request shows an error state with retry — and no stale or fake numbers', async () => {
    await open('error');
    expect(text()).toContain('Could not load the dashboard');
    expect(root().querySelectorAll('article').length).toBe(0);

    (Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Try again')) as HTMLButtonElement).click();
    await settle();
    httpMock.expectOne((r) => r.url === SUMMARY_URL).flush(summary());
    await settle();
    expect(text()).toContain('417');
  });
});

describe('dashboard-format', () => {
  it('maps each real course status to its own view, and an unknown one to a neutral fallback', () => {
    expect(courseStatusView('Published').tone).toBe('success');
    expect(courseStatusView('Draft').labelKey).toBe('instructor.dashboard.status.Draft');
    expect(courseStatusView('Rejected').tone).toBe('danger');
    expect(courseStatusView('SomethingNew').labelKey).toBe('instructor.dashboard.status.unknown');
  });

  it('formats the revenue change with an explicit sign and never "-0.0%"', () => {
    expect(formatChangePercent(14.5)).toBe('+14.5%');
    expect(formatChangePercent(-3.24)).toBe('-3.2%');
    expect(formatChangePercent(0)).toBe('0.0%');
    expect(formatChangePercent(-0.01)).toBe('0.0%');
  });

  it('formats a rating to one decimal', () => {
    expect(formatRating(4.25)).toBe('4.3');
    expect(formatRating(5)).toBe('5.0');
  });
});
