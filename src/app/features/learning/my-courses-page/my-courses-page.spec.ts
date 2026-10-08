import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import type { MyUpcomingSessionItem, MyUpcomingSessionsResponse } from '../../live/data/live-learner.models';
import { MyCoursesPage } from './my-courses-page';

const ENROLLMENTS_URL = '/api/learning/enrollments/me?page=1&pageSize=50';
const UPCOMING_URL = '/api/live/me/sessions/upcoming?limit=10';

function enrollment(courseId: string, slug: string, title: string): Record<string, unknown> {
  return {
    id: `enr-${courseId}`,
    courseId,
    userId: 'u-1',
    progressPercent: 10,
    status: 'Active',
    enrolledAtUtc: '2026-09-01T00:00:00Z',
    expiresAtUtc: null,
    completedAtUtc: null,
    courseTitle: title,
    courseSlug: slug,
    instructorName: 'Ann',
  };
}

function upcoming(overrides: Partial<MyUpcomingSessionItem> = {}): MyUpcomingSessionItem {
  return {
    sessionId: 's-1',
    courseId: 'c-live',
    courseTitle: 'Live course',
    courseSlug: 'live-course',
    title: 'Session one',
    startsAtUtc: '2099-10-08T03:00:00Z',
    endsAtUtc: '2099-10-08T05:00:00Z',
    displayState: 'Upcoming',
    canJoin: false,
    joinOpensAtUtc: '2099-10-08T02:45:00Z',
    ...overrides,
  };
}

describe('MyCoursesPage live "next session" chips', () => {
  let fixture: ComponentFixture<MyCoursesPage>;
  let httpMock: HttpTestingController;

  function open(): HTMLElement {
    fixture = TestBed.createComponent(MyCoursesPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function loadEnrollments(): void {
    httpMock.expectOne(ENROLLMENTS_URL).flush({
      items: [enrollment('c-live', 'live-course', 'Live course'), enrollment('c-video', 'video-course', 'Video course')],
      page: 1,
      pageSize: 50,
      totalCount: 2,
    });
  }

  /** `rxResource` publishes its value from an internal effect, so let it settle before asserting on the DOM. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function respondUpcoming(items: readonly MyUpcomingSessionItem[]): Promise<void> {
    const body: MyUpcomingSessionsResponse = { serverTimeUtc: new Date().toISOString(), items };
    httpMock.expectOne(UPCOMING_URL).flush(body);
    await settle();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MyCoursesPage],
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(TranslationService).setLocale('en');
  });

  afterEach(() => httpMock.verify());

  it('shows the next session only on the course that has one, and none on the others', async () => {
    const root = open();
    loadEnrollments();
    await respondUpcoming([upcoming()]);

    const chips = root.querySelectorAll('app-live-next-session-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain('Next session');
    expect(root.textContent).toContain('Video course');
  });

  it('picks the soonest session when a course has several, regardless of the API order', async () => {
    const root = open();
    loadEnrollments();
    await respondUpcoming([
      upcoming({ sessionId: 's-late', title: 'Later session', startsAtUtc: '2099-10-15T03:00:00Z', joinOpensAtUtc: '2099-10-15T02:45:00Z' }),
      upcoming({ sessionId: 's-soon', title: 'Sooner session' }),
    ]);

    const chips = root.querySelectorAll('app-live-next-session-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain('Sooner session');
    expect(chips[0].textContent).not.toContain('Later session');
  });

  it('offers the join button only when the server says the window is open', async () => {
    const root = open();
    loadEnrollments();
    await respondUpcoming([upcoming({ displayState: 'Live', canJoin: true })]);
    fixture.detectChanges();
    expect(root.querySelector('a[href="/live/s-1/join"]')).not.toBeNull();
  });

  it('renders no chips when there are no upcoming sessions', async () => {
    const root = open();
    loadEnrollments();
    await respondUpcoming([]);
    fixture.detectChanges();
    expect(root.querySelector('app-live-next-session-chip')).toBeNull();
    expect(root.textContent).toContain('Live course');
  });

  it('still renders the whole course list when the upcoming-sessions call fails', async () => {
    const root = open();
    loadEnrollments();
    httpMock.expectOne(UPCOMING_URL).flush({}, { status: 500, statusText: 'err' });
    await settle();

    expect(root.querySelector('app-live-next-session-chip')).toBeNull();
    expect(root.textContent).toContain('Live course');
    expect(root.textContent).toContain('Video course');
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('MyCoursesPage enrollment details and certificate download', () => {
  let fixture: ComponentFixture<MyCoursesPage>;
  let httpMock: HttpTestingController;

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function open(items: readonly Record<string, unknown>[]): Promise<HTMLElement> {
    fixture = TestBed.createComponent(MyCoursesPage);
    fixture.detectChanges();
    httpMock.expectOne(ENROLLMENTS_URL).flush({ items, page: 1, pageSize: 50, totalCount: items.length });
    httpMock.expectOne(UPCOMING_URL).flush({ serverTimeUtc: new Date().toISOString(), items: [] });
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MyCoursesPage],
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(TranslationService).setLocale('en');
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('omits the instructor line and shows a neutral title label when the API has neither', async () => {
    const root = await open([{ ...enrollment('c-1', 'slug-1', ''), courseTitle: null, instructorName: null }]);

    expect(root.querySelector('ng-icon[name="phosphorUser"]')).toBeNull();
    expect(root.textContent).toContain('Course title unavailable');
    expect(root.textContent).not.toContain('null');
  });

  it('tells the learner certificates are unavailable (503 certificate.public_url_not_configured) instead of opening another page', async () => {
    const root = await open([{ ...enrollment('c-1', 'slug-1', 'Finished course'), progressPercent: 100 }]);
    const toastError = vi.spyOn(TestBed.inject(ToastService), 'error');
    const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);

    const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Certificate')) as HTMLButtonElement;
    button.click();
    httpMock.expectOne('/api/learning/certificates/by-enrollment/enr-c-1').flush({
      id: 'cert-1', enrollmentId: 'enr-c-1', serialNo: 'SN-1', verifyCode: 'VC-1', issuedAtUtc: '2026-10-01T00:00:00Z',
      learnerName: 'Ann', courseTitle: 'Finished course', verifyUrl: '/certificates/verify/VC-1',
    });
    httpMock.expectOne('/api/learning/certificates/cert-1/download').flush(
      new Blob([JSON.stringify({ title: 'Certificate public URL is not configured.', status: 503, errorCode: 'certificate.public_url_not_configured' })],
        { type: 'application/problem+json' }),
      { status: 503, statusText: 'Service Unavailable' },
    );
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    expect(toastError.mock.calls[0][0]).toBe('Certificate downloads are temporarily unavailable. Please try again later.');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('keeps the existing verify-page fallback for any other failed download', async () => {
    const root = await open([{ ...enrollment('c-1', 'slug-1', 'Finished course'), progressPercent: 100 }]);
    const toastError = vi.spyOn(TestBed.inject(ToastService), 'error');
    const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);

    (Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Certificate')) as HTMLButtonElement).click();
    httpMock.expectOne('/api/learning/certificates/by-enrollment/enr-c-1').flush({
      id: 'cert-1', enrollmentId: 'enr-c-1', serialNo: 'SN-1', verifyCode: 'VC-1', issuedAtUtc: '2026-10-01T00:00:00Z',
      learnerName: 'Ann', courseTitle: 'Finished course', verifyUrl: '/certificates/verify/VC-1',
    });
    httpMock.expectOne('/api/learning/certificates/cert-1/download').flush(null, { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() => expect(openWindow).toHaveBeenCalledWith('/certificates/verify/VC-1', '_blank'));
    expect(toastError).not.toHaveBeenCalled();
  });
});
