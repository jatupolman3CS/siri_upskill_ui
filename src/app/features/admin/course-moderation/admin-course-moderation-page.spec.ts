import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { PagedPendingCoursesResponse } from './data/admin-moderation-api.models';
import { AdminCourseModerationPage } from './admin-course-moderation-page';

registerLocaleData(localeTh);

const MOCK_PENDING: PagedPendingCoursesResponse = {
  items: [
    {
      id: 'course-1',
      slug: 'react-mastery',
      title: 'React 19 & Next.js Mastery',
      instructorId: 'inst-1',
      instructorName: 'สมชาย ใจดี',
      categoryId: 'cat-1',
      categoryName: 'Web Development',
      price: 2490,
      thumbnailUrl: null,
      episodeCount: 15,
      totalDurationMinutes: 180,
      submittedAtUtc: '2026-08-25T12:00:00Z',
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
};

describe('AdminCourseModerationPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        CurrencyPipe,
        provideRouter([{ path: 'admin/courses', component: AdminCourseModerationPage }]),
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

  async function navigate(): Promise<AdminCourseModerationPage> {
    const component = await harness.navigateByUrl('/admin/courses', AdminCourseModerationPage);
    await settle();
    return component;
  }

  it('renders pending courses list from API', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url === '/api/catalog/admin/courses/pending');
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_PENDING);
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('React 19 & Next.js Mastery');
    expect(text).toContain('สมชาย ใจดี');
    expect(text).toContain('2,490');
    expect(text).toContain('15 บทเรียน');
  });

  it('approves a pending course and reloads the list', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url === '/api/catalog/admin/courses/pending');
    req.flush(MOCK_PENDING);
    await settle();

    const approveBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('อนุมัติเผยแพร่')
    );
    expect(approveBtn).toBeDefined();
    approveBtn?.click();
    await settle();

    const approveReq = httpMock.expectOne('/api/catalog/admin/courses/course-1/approve');
    expect(approveReq.request.method).toBe('POST');
    approveReq.flush({
      id: 'course-1',
      status: 'Published',
      publishedAtUtc: new Date().toISOString(),
    });
    await settle();

    const reloadReq = httpMock.expectOne((r) => r.url === '/api/catalog/admin/courses/pending');
    reloadReq.flush({ items: [], totalCount: 0, page: 1, pageSize: 50 });
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('อนุมัติและเผยแพร่คอร์ส "React 19 & Next.js Mastery" เรียบร้อยแล้ว');
  });

  it('rejects a course with reason and reloads the list', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url === '/api/catalog/admin/courses/pending');
    req.flush(MOCK_PENDING);
    await settle();

    const rejectBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('ส่งกลับแก้ไข')
    );
    expect(rejectBtn).toBeDefined();
    rejectBtn?.click();
    await settle();

    // Fill rejection reason
    const textarea = harness.routeNativeElement?.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    textarea.value = 'กรุณาเพิ่มคำอธิบายบทเรียนใน Section 2';
    textarea.dispatchEvent(new Event('input'));
    await settle();

    // Click confirm in modal
    const confirmBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('ยืนยันการส่งกลับแก้ไข')
    );
    expect(confirmBtn).toBeDefined();
    confirmBtn?.click();
    await settle();

    const rejectReq = httpMock.expectOne('/api/catalog/admin/courses/course-1/reject');
    expect(rejectReq.request.method).toBe('POST');
    expect(rejectReq.request.body.reason).toBe('กรุณาเพิ่มคำอธิบายบทเรียนใน Section 2');
    rejectReq.flush({
      id: 'course-1',
      status: 'Rejected',
      rejectionReason: 'กรุณาเพิ่มคำอธิบายบทเรียนใน Section 2',
    });
    await settle();

    const reloadReq = httpMock.expectOne((r) => r.url === '/api/catalog/admin/courses/pending');
    reloadReq.flush({ items: [], totalCount: 0, page: 1, pageSize: 50 });
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('ส่งกลับคอร์ส "React 19 & Next.js Mastery" เพื่อแก้ไขเรียบร้อยแล้ว');
  });
});
