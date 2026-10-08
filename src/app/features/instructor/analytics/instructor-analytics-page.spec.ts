import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { InstructorAnalyticsPage } from './instructor-analytics-page';
import { InstructorAnalyticsSummaryResponse, InstructorStudentProgress } from './instructor-analytics.service';

registerLocaleData(localeTh);

function student(overrides: Partial<InstructorStudentProgress>): InstructorStudentProgress {
  return {
    id: 's-1',
    name: 'Ann Learner',
    email: 'ann@example.test',
    courseTitle: 'Angular Basics',
    progressPercent: 40,
    completedEpisodes: 2,
    totalEpisodes: 5,
    lastActiveAtUtc: '2026-10-01T03:00:00Z',
    ...overrides,
  };
}

function summary(students: readonly InstructorStudentProgress[]): InstructorAnalyticsSummaryResponse {
  return {
    totalViews: 10,
    totalWatchMinutes: 20,
    avgCompletionRate: 30,
    totalRevenue: 0,
    totalEnrollments: students.length,
    dropOffStats: [],
    students,
    courses: [],
  };
}

describe('InstructorAnalyticsPage students table', () => {
  let fixture: ComponentFixture<InstructorAnalyticsPage>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [InstructorAnalyticsPage],
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InstructorAnalyticsPage);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function load(students: readonly InstructorStudentProgress[]): HTMLElement {
    httpMock.expectOne((r) => r.url === '/api/analytics/instructor/dashboard/summary').flush(summary(students));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows real values for a learner that has a name, email and last activity', () => {
    const text = load([student({})]).textContent ?? '';
    expect(text).toContain('Ann Learner');
    expect(text).toContain('ann@example.test');
    expect(text).toContain('Angular Basics');
    expect(text).toContain('01/10/2026');
  });

  it('uses neutral labels instead of "null" for an unresolved learner who never opened the course', () => {
    const text = load([student({ name: null, email: null, lastActiveAtUtc: null })]).textContent ?? '';
    expect(text).toContain('Unknown name');
    expect(text).toContain('Has not opened the course yet');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });

  it('exports an empty cell, not the word "null", for a learner that never opened the course', () => {
    load([student({ name: null, email: null, lastActiveAtUtc: null })]);
    let href = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      href = decodeURI(this.getAttribute('href') ?? '');
    });
    (fixture.componentInstance as unknown as { exportCsv(): void }).exportCsv();
    expect(href).toContain('"","","Angular Basics",40%,2,5,""');
    expect(href).not.toContain('null');
  });
});
