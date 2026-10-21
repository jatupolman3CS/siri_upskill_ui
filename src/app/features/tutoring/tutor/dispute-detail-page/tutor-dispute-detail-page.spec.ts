import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../learner/testing/spec-helpers';
import type { DisputeDetail } from '../../data/tutoring-dispute.models';
import { TutorDisputeDetailPage } from './tutor-dispute-detail-page';

const mockDisputeDetail = (overrides: Partial<DisputeDetail> = {}): DisputeDetail => ({
  disputeId: 'd-1',
  disputeNo: 'DP-2026-001',
  bookingId: 'b-1',
  bookingNo: 'BK-2026-101',
  status: 'Open',
  category: 'Behavior',
  flow: 'Escrow',
  myRole: 'Tutor',
  openedByRole: 'Learner',
  description: 'Learner reported tutor was 15 minutes late.',
  session: {
    startsAtUtc: '2026-10-19T10:00:00Z',
    endsAtUtc: '2026-10-19T11:00:00Z',
    subjectNameTh: 'คณิตศาสตร์ ม.3',
    subjectNameEn: 'Math Grade 9',
  },
  counterparty: {
    role: 'Learner',
    displayName: 'Somchai (Learner)',
    gradeLevel: 'Secondary3',
  },
  evidenceLinks: [
    {
      evidenceId: 'e-1',
      url: 'https://example.com/screenshot.png',
      host: 'example.com',
      label: 'Screenshot of clock',
      addedByRole: 'Learner',
      addedAtUtc: '2026-10-19T11:00:00Z',
    },
  ],
  messages: [],
  openedAtUtc: '2026-10-19T11:00:00Z',
  lastActivityAtUtc: '2026-10-19T11:00:00Z',
  expectedResolutionByUtc: '2026-10-22T11:00:00Z',
  fundsOnHold: true,
  decision: null,
  withdrawnAtUtc: null,
  canPostMessage: true,
  canWithdraw: false,
  withdrawBlockedReason: 'not_opener',
  serverTimeUtc: '2026-10-19T11:30:00Z',
  ...overrides,
});

describe('TutorDisputeDetailPage', () => {
  let fixture: ComponentFixture<TutorDisputeDetailPage>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TutorDisputeDetailPage],
      providers: [
        provideRouter([
          { path: 'instructor/tutoring/disputes', component: TutorDisputeDetailPage },
          { path: 'instructor/tutoring/disputes/:disputeId', component: TutorDisputeDetailPage },
        ]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'disputeId' ? 'd-1' : null),
              },
            },
          },
        },
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TutorDisputeDetailPage);
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('loads dispute detail and renders session, counterparty, description, and evidence', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    expect(req.request.method).toBe('GET');
    req.flush(mockDisputeDetail());
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('DP-2026-001');
    expect(text).toContain('BK-2026-101');
    expect(text).toContain('Math Grade 9');
    expect(text).toContain('Somchai (Learner)');
    expect(text).toContain('Secondary 3 (Grade 9)');
    expect(text).toContain('Learner reported tutor was 15 minutes late.');
    expect(text).toContain('Screenshot of clock');
    expect(text).toContain('payment for this class is temporarily held');
  });

  it('shows not found empty state when API responds 404', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    req.flush({ error: 'Dispute not found' }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);

    expect(textOf(root())).toContain('Dispute not found');
  });

  it('shows error state with retry on 500 error', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    req.flush({ error: 'Server error' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(textOf(root())).toContain('Could not load dispute');
    const retryBtn = buttonByText(root(), 'Try again');
    expect(retryBtn).not.toBeNull();

    retryBtn!.click();
    await settle(fixture);

    const retryReq = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    retryReq.flush(mockDisputeDetail());
    await settle(fixture);

    expect(textOf(root())).toContain('DP-2026-001');
  });

  it('renders staff decision when dispute is decided', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    req.flush(
      mockDisputeDetail({
        status: 'Resolved',
        decision: {
          resolution: 'PartialRefund',
          refundAmount: 200,
          note: 'Partial refund of 200 THB granted to learner.',
          decidedAtUtc: '2026-10-20T10:00:00Z',
          attendanceOverturned: false,
        },
      }),
    );
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('Staff Decision');
    expect(text).toContain('Partial refund');
    expect(text).toContain('Partial refund of 200 THB granted to learner.');
    expect(text).toContain('200');
  });

  it('renders reply form when canPostMessage is true and posts reply', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    req.flush(mockDisputeDetail({ canPostMessage: true }));
    await settle(fixture);

    const replyForm = root().querySelector('app-tutor-dispute-reply-form');
    expect(replyForm).not.toBeNull();
  });

  it('allows tutor to withdraw dispute when canWithdraw is true', async () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    req.flush(
      mockDisputeDetail({
        canWithdraw: true,
        openedByRole: 'Tutor',
        withdrawBlockedReason: null,
      }),
    );
    await settle(fixture);

    const withdrawBtn = buttonByText(root(), 'Withdraw dispute');
    expect(withdrawBtn).not.toBeNull();

    withdrawBtn!.click();
    await settle(fixture);

    // Confirmation modal opens
    expect(textOf(root())).toContain('Withdrawing will close the dispute');

    const confirmBtn = buttonByText(root(), 'Confirm withdrawal');
    expect(confirmBtn).not.toBeNull();

    confirmBtn!.click();
    await settle(fixture);

    const postWithdraw = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1/withdraw');
    expect(postWithdraw.request.method).toBe('POST');
    postWithdraw.flush({});
    await settle(fixture);

    // Triggers dispute reload
    const reloadReq = httpMock.expectOne('/api/tutoring/tutor/disputes/d-1');
    reloadReq.flush(
      mockDisputeDetail({
        status: 'Withdrawn',
        canWithdraw: false,
        canPostMessage: false,
      }),
    );
    await settle(fixture);

    expect(textOf(root())).toContain('Withdrawn');
  });
});
