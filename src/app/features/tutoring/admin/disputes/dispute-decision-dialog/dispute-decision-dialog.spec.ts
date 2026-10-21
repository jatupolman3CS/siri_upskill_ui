import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminDisputeDetail } from '../../data/admin-dispute.models';
import { disputeDetail } from '../../testing/fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, typeInto, useEnglish } from '../../testing/spec-helpers';
import { DisputeDecisionDialog } from './dispute-decision-dialog';

const DECIDE = '/api/tutoring/admin/disputes/d-1/decide';

describe('DisputeDecisionDialog', () => {
  let fixture: ComponentFixture<DisputeDecisionDialog>;
  let httpMock: HttpTestingController;
  let decided: AdminDisputeDetail[];
  let stale: string[];

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const dialogText = (): string => textOf(root().querySelector('[role="dialog"]') as HTMLElement);
  const footer = (): HTMLButtonElement[] => Array.from(root().querySelectorAll<HTMLButtonElement>('[modalFooter] app-button button'));
  const primary = (): HTMLButtonElement => footer()[footer().length - 1];
  const radios = (): HTMLInputElement[] => Array.from(root().querySelectorAll<HTMLInputElement>('input[name="dispute-outcome"]'));
  const checkboxes = (): HTMLInputElement[] => Array.from(root().querySelectorAll<HTMLInputElement>('app-checkbox input'));

  async function open(overrides: Partial<AdminDisputeDetail> = {}): Promise<void> {
    fixture.componentRef.setInput('detail', disputeDetail(overrides));
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
  }

  async function pick(label: string): Promise<void> {
    (radios().find((radio) => radio.closest('label')?.textContent?.includes(label)) as HTMLInputElement).click();
    await settle(fixture);
  }

  async function note(text = 'Both sides were heard.'): Promise<void> {
    typeInto(root().querySelector('[role="dialog"] app-tutor-textarea textarea'), text);
    await settle(fixture);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DisputeDecisionDialog);
    decided = [];
    stale = [];
    fixture.componentInstance.decided.subscribe((detail) => decided.push(detail));
    fixture.componentInstance.stale.subscribe((text) => stale.push(text));
  });

  afterEach(() => httpMock.verify());

  it('offers refund options for a payment dispute and preselects none', async () => {
    await open();
    expect(radios().map((radio) => radio.closest('label')?.textContent?.trim())).toEqual([
      'Refund the learner in full',
      'Refund part of it',
      'No refund (considered)',
      'Reject the dispute (not valid, or abuse)',
    ]);
    expect(radios().some((radio) => radio.checked)).toBe(false);
    expect(dialogText()).toContain('Both the learner and the tutor will read this.');
  });

  it('offers only accept or reject - no money anywhere - for an attendance appeal', async () => {
    await open({ flow: 'AttendanceAppeal' });
    expect(radios().map((radio) => radio.closest('label')?.textContent?.trim())).toEqual(['Accept the appeal', 'Reject the appeal']);
    expect(dialogText()).toContain('No money is refunded.');
    await pick('Accept the appeal');
    expect(root().querySelector('input[inputmode="decimal"]')).toBeNull();
    expect(checkboxes().length).toBeGreaterThanOrEqual(2);
  });

  it('needs an outcome and a note before it goes to the confirmation', async () => {
    await open();
    primary().click();
    await settle(fixture);
    expect(dialogText()).toContain('Please choose a decision');
    expect(dialogText()).toContain('This field is required.');
    expect(dialogText()).not.toContain('Confirm decision');
  });

  it('says what a full refund will do, in plain words, while choosing and again before confirming', async () => {
    await open();
    await pick('Refund the learner in full');
    expect(dialogText()).toContain('refunded the whole remaining amount of this class through Stripe');
    expect(dialogText()).toContain('The tutor receives nothing for this class.');
    await note();
    primary().click();
    await settle(fixture);
    expect(dialogText()).toContain('Once recorded it cannot be changed.');
    expect(dialogText()).toContain('refunded the whole remaining amount');
    expect(dialogText()).toContain('Both sides were heard.');
    httpMock.expectNone(DECIDE);
  });

  it('sends a full refund with no amount, after the confirmation only', async () => {
    await open();
    await pick('Refund the learner in full');
    await note();
    primary().click();
    await settle(fixture);
    primary().click();
    const request = httpMock.expectOne(DECIDE);
    expect(request.request.body).toEqual({
      decision: 'Resolve',
      resolution: 'FullRefund',
      refundAmount: null,
      attendanceOverturned: false,
      compensationRequired: false,
      note: 'Both sides were heard.',
      suspendTutor: false,
      suspendReason: null,
    });
    request.flush(disputeDetail({ status: 'Resolved' }));
    await settle(fixture);
    expect(decided.map((detail) => detail.status)).toEqual(['Resolved']);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the price and what was already refunded beside a partial refund without computing the rest', async () => {
    await open({ priceAmount: 800, refundedAmount: 200 });
    await pick('Refund part of it');
    const text = dialogText();
    expect(text).toContain('฿800.00 / ฿200.00');
    expect(text).not.toContain('฿600.00');
    expect(text).toContain('The system checks it and tells you the maximum.');
  });

  it('needs a positive amount for a partial refund and sends it as a number', async () => {
    await open();
    await pick('Refund part of it');
    await note();
    typeInto(root().querySelector('input[inputmode="decimal"]'), '0');
    await settle(fixture);
    primary().click();
    await settle(fixture);
    expect(dialogText()).toContain('The refund must be above 0');

    typeInto(root().querySelector('input[inputmode="decimal"]'), '250.50');
    await settle(fixture);
    primary().click();
    await settle(fixture);
    expect(dialogText()).toContain('Refund: ฿250.50');
    primary().click();
    const request = httpMock.expectOne(DECIDE);
    expect(request.request.body).toMatchObject({ decision: 'Resolve', resolution: 'PartialRefund', refundAmount: 250.5 });
    request.flush(disputeDetail({ status: 'Resolved' }));
  });

  it('cannot be confirmed twice while the request is in flight', async () => {
    await open();
    await pick('No refund');
    await note();
    primary().click();
    await settle(fixture);
    primary().click();
    await settle(fixture);
    primary().click();
    httpMock.expectOne(DECIDE).flush(disputeDetail({ status: 'Resolved' }));
    expect(decided).toHaveLength(1);
  });

  it('goes back to the form with the server\'s maximum when the refund is more than can be refunded', async () => {
    await open();
    await pick('Refund part of it');
    await note();
    typeInto(root().querySelector('input[inputmode="decimal"]'), '900');
    await settle(fixture);
    primary().click();
    await settle(fixture);
    primary().click();
    httpMock.expectOne(DECIDE).flush(problemBody(409, 'tutoring.refund_exceeds_cap', 'conflict', { maxRefundable: 600 }), { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    const text = dialogText();
    expect(text).toContain('The refund is more than can be refunded.');
    expect(text).toContain('The most the system allows: ฿600.00');
    expect(root().querySelector('input[inputmode="decimal"]')).not.toBeNull();
    expect(decided).toHaveLength(0);
  });

  it('hands a case someone else decided back to the page to reload', async () => {
    await open();
    await pick('No refund');
    await note();
    primary().click();
    await settle(fixture);
    primary().click();
    httpMock.expectOne(DECIDE).flush(problemBody(409, 'tutoring.dispute_not_decidable', 'conflict'), { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(stale).toHaveLength(1);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('warns that money already paid out is taken back from the tutor\'s next earnings', async () => {
    await open({ escrowFreeze: 'TooLate' });
    await pick('Refund the learner in full');
    expect(dialogText()).toContain("taken from the tutor's next earnings");
  });

  it('mentions the package credit for a full refund of a package booking', async () => {
    await open({ isPackageBooking: true });
    await pick('Refund the learner in full');
    expect(dialogText()).toContain('marked as refunded');
  });

  it('lets a verified tutor be suspended with the decision, and needs a reason for it', async () => {
    await open();
    await pick('Reject the dispute');
    await note();
    checkboxes()[0].click();
    await settle(fixture);
    expect(dialogText()).toContain('The tutor is suspended after the decision is recorded');
    primary().click();
    await settle(fixture);
    expect(dialogText()).not.toContain('Confirm decision');

    typeInto(root().querySelectorAll('[role="dialog"] app-tutor-textarea textarea')[1] as HTMLTextAreaElement, 'Repeated abuse');
    await settle(fixture);
    primary().click();
    await settle(fixture);
    primary().click();
    const request = httpMock.expectOne(DECIDE);
    expect(request.request.body).toMatchObject({ decision: 'Reject', resolution: null, suspendTutor: true, suspendReason: 'Repeated abuse' });
    request.flush(disputeDetail({ status: 'Rejected', tutorSuspension: 'Done' }));
  });

  it('does not offer to suspend a tutor who is not verified', async () => {
    await open({ tutorHistory: { ...disputeDetail().tutorHistory, status: 'Suspended' } });
    expect(checkboxes()).toHaveLength(0);
  });

  it('sends the appeal flags only for an accepted appeal, and never a resolution or an amount', async () => {
    await open({ flow: 'AttendanceAppeal', bookingStatusAtOpen: 'NoShowTutor' });
    await pick('Accept the appeal');
    await note();
    checkboxes()[0].click();
    checkboxes()[1].click();
    await settle(fixture);
    expect(dialogText()).toContain('The reliability penalty for this no-show is voided.');
    expect(dialogText()).toContain('The system pays nothing; you compensate the tutor yourself');
    primary().click();
    await settle(fixture);
    primary().click();
    const request = httpMock.expectOne(DECIDE);
    expect(request.request.body).toMatchObject({ decision: 'Resolve', resolution: null, refundAmount: null, attendanceOverturned: true, compensationRequired: true });
    request.flush(disputeDetail({ status: 'Resolved' }));
  });

  it('starts clean every time it opens', async () => {
    await open();
    await pick('No refund');
    await note('Left over');
    fixture.componentRef.setInput('open', false);
    await settle(fixture);
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
    expect(radios().some((radio) => radio.checked)).toBe(false);
    expect((root().querySelector('[role="dialog"] textarea') as HTMLTextAreaElement).value).toBe('');
  });
});
