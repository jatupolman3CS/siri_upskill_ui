import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AdminDashboardSummaryResponse } from './data/admin-dashboard-api.models';
import { AdminDashboardPage } from './admin-dashboard-page';

registerLocaleData(localeTh);

const MOCK_SUMMARY: AdminDashboardSummaryResponse = {
  todaySales: 25400,
  todayNewLearners: 12,
  totalLearners: 1250,
  pendingCourseReviewsCount: 3,
  pendingRefundsCount: 2,
  topCourses30Days: [
    {
      courseId: 'c1111111-1111-1111-1111-111111111111',
      courseTitle: 'Full-Stack Angular & .NET 10',
      totalRevenue: 150000,
      totalEnrollments: 80,
      totalViews: 1200,
    },
  ],
};

describe('AdminDashboardPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        CurrencyPipe,
        provideRouter([{ path: 'admin', component: AdminDashboardPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function navigate(): Promise<AdminDashboardPage> {
    const component = await harness.navigateByUrl('/admin', AdminDashboardPage);
    await settle();
    return component;
  }

  it('renders loading skeletons before API returns', async () => {
    await navigate();
    const req = httpMock.expectOne('/api/analytics/admin/dashboard/summary');
    expect(req.request.method).toBe('GET');

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('ศูนย์ควบคุมระบบ');
    expect(harness.routeNativeElement?.querySelectorAll('app-skeleton').length).toBeGreaterThan(0);

    req.flush(MOCK_SUMMARY);
    await settle();
  });

  it('renders live stats cards and top courses table on successful response', async () => {
    await navigate();
    const req = httpMock.expectOne('/api/analytics/admin/dashboard/summary');
    req.flush(MOCK_SUMMARY);
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('25,400');
    expect(text).toContain('1,250 คน');
    expect(text).toContain('+12 สมัครใหม่วันนี้');
    expect(text).toContain('3 คอร์ส');
    expect(text).toContain('2 รายการ');
    expect(text).toContain('Full-Stack Angular & .NET 10');
    expect(text).toContain('150,000');

    // Navigation links
    expect(harness.routeNativeElement?.querySelector('a[href="/admin/courses"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/admin/payouts"]')).not.toBeNull();
  });

  it('renders error banner and allows retry when API fails', async () => {
    await navigate();
    const req = httpMock.expectOne('/api/analytics/admin/dashboard/summary');
    req.flush({ title: 'Server Error' }, { status: 500, statusText: 'Internal Server Error' });
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('ไม่สามารถดึงข้อมูลสรุปแดชบอร์ดได้');

    const retryBtn = harness.routeNativeElement?.querySelector('button') as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();
    retryBtn.click();
    await settle();

    const retryReq = httpMock.expectOne('/api/analytics/admin/dashboard/summary');
    retryReq.flush(MOCK_SUMMARY);
    await settle();

    const textAfter = harness.routeNativeElement?.textContent ?? '';
    expect(textAfter).toContain('25,400');
  });
});
