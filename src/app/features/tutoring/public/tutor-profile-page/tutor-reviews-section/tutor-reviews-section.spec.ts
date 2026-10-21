import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { publicTutorReview, tutorReviewsResponse, tutorReviewsSummary } from '../../../testing/review-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { TutorReviewsSection } from './tutor-reviews-section';

registerLocaleData(localeTh);

const SLUG = 'nina-tutor';
const BASE_URL = `/api/tutoring/tutors/${SLUG}/reviews`;

describe('TutorReviewsSection', () => {
  let httpMock: HttpTestingController;

  function setUp(): ComponentFixture<TutorReviewsSection> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TutorReviewsSection);
    fixture.componentRef.setInput('slug', SLUG);
    return fixture;
  }

  async function settle(fixture: ComponentFixture<TutorReviewsSection>): Promise<void> {
    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      TestBed.tick();
      await Promise.resolve();
    }
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  it('asks for nothing until the first render has happened (protecting SSR)', async () => {
    const fixture = setUp();
    // Before settle (before render hook), no request should be made
    httpMock.expectNone((req) => req.url.startsWith(BASE_URL));

    await settle(fixture);
    httpMock.expectOne((req) => req.url.startsWith(BASE_URL)).flush(tutorReviewsResponse());
  });

  it('reads reviews in browser after first render and displays summary and reviews', async () => {
    const fixture = setUp();
    await settle(fixture);

    const req = httpMock.expectOne((r) => r.url.startsWith(BASE_URL));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('sort')).toBe('newest');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(tutorReviewsResponse());
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('4.8');
    expect(el.textContent).toContain('15');
    expect(el.textContent).toContain('Somchai');
    expect(el.textContent).toContain('Great teaching style and very patient.');
  });

  it('displays no reviews message when ratingCount is 0', async () => {
    const fixture = setUp();
    await settle(fixture);

    httpMock.expectOne((r) => r.url.startsWith(BASE_URL)).flush(
      tutorReviewsResponse({
        summary: tutorReviewsSummary({ ratingCount: 0, ratingAverage: 0 }),
        reviews: { items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 },
      }),
    );
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No reviews yet');
  });

  it('filters by rating when star button is clicked', async () => {
    const fixture = setUp();
    await settle(fixture);

    httpMock.expectOne((r) => r.url.startsWith(BASE_URL)).flush(tutorReviewsResponse());
    await settle(fixture);

    fixture.componentInstance.setRating(5);
    await settle(fixture);

    const req = httpMock.expectOne((r) => r.url.startsWith(BASE_URL) && r.params.get('rating') === '5');
    expect(req.request.params.get('rating')).toBe('5');
    req.flush(tutorReviewsResponse());
  });

  it('updates sort when sort option changes', async () => {
    const fixture = setUp();
    await settle(fixture);

    httpMock.expectOne((r) => r.url.startsWith(BASE_URL)).flush(tutorReviewsResponse());
    await settle(fixture);

    fixture.componentInstance.setSort('highest');
    await settle(fixture);

    const req = httpMock.expectOne((r) => r.url.startsWith(BASE_URL) && r.params.get('sort') === 'highest');
    expect(req.request.params.get('sort')).toBe('highest');
    req.flush(tutorReviewsResponse());
  });

  it('renders Thai reviewer label and subject name in Thai', async () => {
    const fixture = setUp();
    useTutoringLanguage('th');
    await settle(fixture);

    httpMock.expectOne((r) => r.url.startsWith(BASE_URL)).flush(
      tutorReviewsResponse({
        reviews: {
          items: [
            publicTutorReview({
              reviewer: { kind: 'Guardian', nickname: null, gradeBand: 'Primary' },
              subjectNameTh: 'คณิตศาสตร์ (TH)',
              subjectNameEn: 'Mathematics',
              edited: true,
            }),
          ],
          totalCount: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        },
      }),
    );
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ผู้ปกครองนักเรียนประถม');
    expect(el.textContent).toContain('คณิตศาสตร์ (TH)');
    expect(el.textContent).toContain('แก้ไขแล้ว');
  });

  it('displays empty state when filtered items are empty', async () => {
    const fixture = setUp();
    await settle(fixture);

    httpMock.expectOne((r) => r.url.startsWith(BASE_URL)).flush(
      tutorReviewsResponse({
        reviews: { items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 },
      }),
    );
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No reviews match this filter');
  });

  it('shows error state with retry button on network error', async () => {
    const fixture = setUp();
    await settle(fixture);

    httpMock.expectOne((r) => r.url.startsWith(BASE_URL)).error(new ProgressEvent('Network error'));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Could not load reviews');
    const retryBtn = el.querySelector('button');
    expect(retryBtn).not.toBeNull();
  });
});
