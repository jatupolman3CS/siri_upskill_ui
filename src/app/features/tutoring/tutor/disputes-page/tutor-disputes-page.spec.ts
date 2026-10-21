import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../learner/testing/spec-helpers';
import type { DisputeListItem } from '../../data/tutoring-dispute.models';
import { TutorDisputesPage } from './tutor-disputes-page';

const mockDispute = (overrides: Partial<DisputeListItem> = {}): DisputeListItem => ({
  disputeId: 'd-1',
  disputeNo: 'DP-2026-001',
  bookingNo: 'BK-2026-101',
  status: 'Open',
  category: 'Behavior',
  flow: 'Escrow',
  myRole: 'Tutor',
  startsAtUtc: '2026-10-19T10:00:00Z',
  subjectNameTh: 'คณิตศาสตร์ ม.3',
  subjectNameEn: 'Math Grade 9',
  openedAtUtc: '2026-10-19T11:00:00Z',
  lastActivityAtUtc: '2026-10-19T11:30:00Z',
  ...overrides,
});

describe('TutorDisputesPage', () => {
  let fixture: ComponentFixture<TutorDisputesPage>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TutorDisputesPage],
      providers: [
        provideRouter([
          { path: 'instructor/tutoring/disputes', component: TutorDisputesPage },
          { path: 'instructor/tutoring/disputes/:disputeId', component: TutorDisputesPage },
        ]),
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TutorDisputesPage);
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('loads disputes list and renders cards with dispute details', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/disputes');
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        mockDispute({ disputeNo: 'DP-001', bookingNo: 'BK-001', subjectNameEn: 'Physics' }),
        mockDispute({ disputeId: 'd-2', disputeNo: 'DP-002', status: 'Resolved' }),
      ],
      totalCount: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('DP-001');
    expect(text).toContain('BK-001');
    expect(text).toContain('Physics');
    expect(text).toContain('DP-002');
  });

  it('shows empty state when no disputes are returned', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/disputes');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 });
    await settle(fixture);

    expect(textOf(root())).toContain('No disputes found');
  });

  it('shows retry button on load failure', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/disputes');
    req.flush('Server error', { status: 500, statusText: 'Internal Error' });
    await settle(fixture);

    expect(textOf(root())).toContain('Could not load disputes');
    const retryBtn = buttonByText(root(), 'Try again');
    expect(retryBtn).not.toBeNull();

    retryBtn!.click();
    await settle(fixture);

    const retryReq = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/disputes');
    retryReq.flush({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 });
  });

  it('renders pagination when totalPages > 1', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/disputes');
    req.flush({
      items: [mockDispute()],
      totalCount: 25,
      page: 1,
      pageSize: 10,
      totalPages: 3,
    });
    await settle(fixture);

    expect(textOf(root())).toContain('Page 1 of 3');
    const nextBtn = buttonByText(root(), 'Next page');
    expect(nextBtn).not.toBeNull();
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
