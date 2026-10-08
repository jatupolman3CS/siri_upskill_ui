import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AnnouncementResponse } from '../../notification/data/notification-api.models';
import { InstructorAnnouncementsPage } from './instructor-announcements-page';

function announcement(id: string, courseId: string): AnnouncementResponse {
  return {
    id,
    courseId,
    instructorId: 'instructor-1',
    title: `Title ${id}`,
    body: `Body ${id}`,
    sendEmail: false,
    sentAtUtc: '2026-10-01T00:00:00Z',
    recipientCount: 3,
    createdAtUtc: '2026-10-01T00:00:00Z',
  };
}

describe('InstructorAnnouncementsPage history', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/announcements', component: InstructorAnnouncementsPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function load(history: readonly AnnouncementResponse[], courseTitles: Record<string, string>): Promise<void> {
    await harness.navigateByUrl('/instructor/announcements', InstructorAnnouncementsPage);
    // The history can resolve before the courses list; titles must still land on the right rows.
    httpMock.expectOne('/api/notifications/instructor/announcements').flush(history);
    httpMock.expectOne((r) => r.url === '/api/catalog/instructor/courses').flush({
      items: Object.entries(courseTitles).map(([id, title]) => ({
        id, slug: id, title, thumbnailUrl: null, price: 0, status: 'Draft', createdAtUtc: '2026-09-01T00:00:00Z',
      })),
      totalCount: Object.keys(courseTitles).length,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    harness.detectChanges();
  }

  /** Text of the history card whose heading is `title` (the course <select> also lists course titles). */
  function cardText(title: string): string {
    const heading = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('h3')).find(
      (h) => h.textContent?.trim() === title,
    );
    return heading?.parentElement?.textContent ?? '';
  }

  it('labels each history row with the real title of its own course', async () => {
    await load([announcement('a1', 'c1'), announcement('a2', 'c2')], { c1: 'Real Course One', c2: 'Real Course Two' });

    expect(cardText('Title a1')).toContain('Real Course One');
    expect(cardText('Title a1')).not.toContain('Real Course Two');
    expect(cardText('Title a2')).toContain('Real Course Two');
  });

  it('shows no invented course label for a row whose course is not in the instructor list', async () => {
    await load([announcement('a1', 'unknown-course')], { c1: 'Real Course One' });

    expect(cardText('Title a1')).not.toContain('Real Course One');
    expect(cardText('Title a1')).not.toContain('คอร์สของฉัน');
    expect(cardText('Title a1')).toContain('Body a1');
  });
});
