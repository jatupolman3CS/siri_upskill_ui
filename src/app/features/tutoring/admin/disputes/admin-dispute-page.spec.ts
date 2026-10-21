import { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthService } from '../../../../core/auth/auth.service';
import type { AdminDisputeDetail } from '../data/admin-dispute.models';
import { disputeDetail, disputeMessage } from '../testing/fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, problemBody, settle, textOf, typeInto, useEnglish } from '../testing/spec-helpers';
import { AdminDisputePage } from './admin-dispute-page';

@Component({ template: '' })
class RouteStub {}

const DISPUTE = '/api/tutoring/admin/disputes/d-1';

describe('AdminDisputePage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/tutoring/disputes/:disputeId', component: AdminDisputePage }, { path: '**', component: RouteStub }]),
        { provide: AuthService, useValue: { currentUser: signal({ id: 'me' }) } },
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function open(answer: AdminDisputeDetail | { status: number; body: object } | 'pending'): Promise<void> {
    await harness.navigateByUrl('/admin/tutoring/disputes/d-1', AdminDisputePage);
    await settle(harness);
    if (answer === 'pending') {
      return;
    }
    const request = httpMock.expectOne(DISPUTE);
    if ('status' in answer && 'body' in answer) {
      request.flush(answer.body, { status: answer.status, statusText: 'x' });
    } else {
      request.flush(answer);
    }
    await settle(harness);
  }

  it('shows a busy skeleton while the case loads', async () => {
    await open('pending');
    expect(root().querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull();
    httpMock.expectOne(DISPUTE).flush(disputeDetail());
  });

  it('lays the case out: header, what was reported, evidence, conversation, the write form and the outcome', async () => {
    await open(disputeDetail({ priority: 'High', isOverdue: true }));
    const text = textOf(root());
    expect(text).toContain('DS-261014-AB12CD');
    expect(text).toContain('High');
    expect(text).toContain('Overdue');
    expect(text).toContain('What was reported');
    expect(text).toContain('Evidence');
    expect(text).toContain('Conversation');
    expect(text).toContain('Write a message');
    expect(text).toContain('Outcome');
    expect(text).toContain('Internal note, administrators only');
    expect(text).toContain('The report was opened.');
  });

  it('offers to take an open case, and sends a plain claim', async () => {
    await open(disputeDetail());
    (buttonByText(root(), 'Take this case') as HTMLButtonElement).click();
    const request = httpMock.expectOne(`${DISPUTE}/claim`);
    expect(request.request.body).toEqual({ takeOver: false });
    request.flush(disputeDetail({ status: 'UnderReview', assignedToUserId: 'me' }));
    await settle(harness);
    expect(textOf(root())).toContain('Assigned to you');
    expect(buttonByText(root(), 'Take this case')).toBeNull();
  });

  it('asks before taking over a case another administrator holds, then claims with takeOver', async () => {
    await open(disputeDetail({ status: 'UnderReview', assignedToUserId: 'someone-else' }));
    expect(textOf(root())).toContain('Assigned to another administrator');
    (buttonByText(root(), 'Take over') as HTMLButtonElement).click();
    await settle(harness);
    expect(root().querySelector('[role="dialog"]')?.textContent).toContain('You replace the administrator who currently holds this case.');
    httpMock.expectNone(`${DISPUTE}/claim`);
    (root().querySelector('[role="dialog"] app-button:last-child button') as HTMLButtonElement).click();
    const request = httpMock.expectOne(`${DISPUTE}/claim`);
    expect(request.request.body).toEqual({ takeOver: true });
    request.flush(disputeDetail({ status: 'UnderReview', assignedToUserId: 'me' }));
    await settle(harness);
    expect(textOf(root())).toContain('Assigned to you');
  });

  it('shows the server\'s refusal of a claim', async () => {
    await open(disputeDetail());
    (buttonByText(root(), 'Take this case') as HTMLButtonElement).click();
    httpMock.expectOne(`${DISPUTE}/claim`).flush(problemBody(409, 'tutoring.dispute_claimed_by_other', 'conflict'), { status: 409, statusText: 'Conflict' });
    await settle(harness);
    expect(textOf(root())).toContain('Another administrator has already taken this case.');
  });

  it('adds a posted message to the conversation without loading the case again', async () => {
    await open(disputeDetail({ messages: [] }));
    typeInto(root().querySelector('app-dispute-message-form textarea'), 'Pulled the logs.');
    await settle(harness);
    (root().querySelector('app-dispute-message-form app-button button') as HTMLButtonElement).click();
    httpMock.expectOne(`${DISPUTE}/messages`).flush(disputeMessage({ authorRole: 'Admin', visibility: 'Internal', body: 'Pulled the logs.' }));
    await settle(harness);
    expect(root().querySelector('app-dispute-thread')?.textContent).toContain('Pulled the logs.');
  });

  it('decides the case and then shows the outcome the server recorded', async () => {
    await open(disputeDetail());
    (buttonByText(root(), 'Decide this dispute') as HTMLButtonElement).click();
    await settle(harness);
    const dialog = (): HTMLElement => root().querySelector('[role="dialog"]') as HTMLElement;
    (Array.from(dialog().querySelectorAll<HTMLInputElement>('input[name="dispute-outcome"]')).find((radio) => radio.closest('label')?.textContent?.includes('No refund')) as HTMLInputElement).click();
    await settle(harness);
    typeInto(dialog().querySelector('textarea'), 'Considered; no remedy.');
    await settle(harness);
    const buttons = (): HTMLButtonElement[] => Array.from(dialog().querySelectorAll<HTMLButtonElement>('[modalFooter] app-button button'));
    buttons()[buttons().length - 1].click();
    await settle(harness);
    buttons()[buttons().length - 1].click();
    httpMock.expectOne(`${DISPUTE}/decide`).flush(
      disputeDetail({
        status: 'Resolved',
        decision: { resolution: 'NoRefund', refundAmount: null, refundId: null, note: 'Considered; no remedy.', decidedAtUtc: '2026-10-15T03:00:00Z', decidedByUserId: 'me', attendanceOverturned: false, penaltyVoided: false },
      }),
    );
    await settle(harness);
    const text = textOf(root());
    expect(text).toContain('Decided');
    expect(text).toContain('No refund');
    expect(text).toContain('Considered; no remedy.');
    expect(buttonByText(root(), 'Decide this dispute')).toBeNull();
    expect(buttonByText(root(), 'Take this case')).toBeNull();
  });

  it('treats a decided case as closed: no claim, no decision, no message to the parties - an internal note stays possible', async () => {
    await open(disputeDetail({ status: 'Resolved' }));
    expect(buttonByText(root(), 'Take this case')).toBeNull();
    expect(buttonByText(root(), 'Decide this dispute')).toBeNull();
    const parties = Array.from(root().querySelectorAll<HTMLInputElement>('app-dispute-message-form input[type="radio"]'))[1];
    expect(parties.disabled).toBe(true);
    expect(textOf(root())).toContain('This dispute is closed.');
  });

  it('closes a withdrawn case in the same way', async () => {
    await open(disputeDetail({ status: 'Withdrawn' }));
    expect(buttonByText(root(), 'Decide this dispute')).toBeNull();
    expect(textOf(root())).toContain('Withdrawn');
  });

  it('closes the compensation follow-up of an appeal from the outcome card', async () => {
    await open(
      disputeDetail({
        flow: 'AttendanceAppeal',
        status: 'Resolved',
        compensationRequired: true,
        compensationSettled: false,
        decision: { resolution: 'NoRefund', refundAmount: null, refundId: null, note: 'Appeal accepted.', decidedAtUtc: '2026-10-15T03:00:00Z', decidedByUserId: 'me', attendanceOverturned: true, penaltyVoided: true },
      }),
    );
    (buttonByText(root(), 'Compensation done') as HTMLButtonElement).click();
    await settle(harness);
    typeInto(root().querySelector('[role="dialog"] textarea'), 'Paid by transfer');
    await settle(harness);
    (root().querySelector('[role="dialog"] app-button:last-child button') as HTMLButtonElement).click();
    httpMock.expectOne(`${DISPUTE}/compensation-settled`).flush(disputeDetail({ flow: 'AttendanceAppeal', status: 'Resolved', compensationRequired: true, compensationSettled: true, decision: null }));
    await settle(harness);
    expect(textOf(root())).toContain('Compensation closed.');
  });

  it('says the dispute does not exist for a 404', async () => {
    await open({ status: 404, body: problemBody(404, 'tutoring.dispute_not_found', 'not_found') });
    expect(textOf(root())).toContain('Dispute not found');
  });

  it('reports a failed load and retries', async () => {
    await open({ status: 500, body: { title: 'x' } });
    expect(textOf(root())).toContain('Could not load disputes');
    (buttonByText(root(), 'Try again') as HTMLButtonElement).click();
    await settle(harness);
    httpMock.expectOne(DISPUTE).flush(disputeDetail());
  });
});
