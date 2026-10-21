import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { disputeDetail } from '../../testing/fixtures';
import { settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { DisputeContextPanel } from './dispute-context-panel';

describe('DisputeContextPanel', () => {
  let fixture: ComponentFixture<DisputeContextPanel>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    useEnglish();
    fixture = TestBed.createComponent(DisputeContextPanel);
  });

  it('shows who joined and when, and says "no record" where there is none', async () => {
    fixture.componentRef.setInput('detail', disputeDetail());
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('Learner joined');
    expect(text).toContain('Tutor joined');
    expect(text).toContain('No record');
    expect(text).toContain('Attendance result: Completed by System');
    expect(text).toContain('Tutor evidence: None');
  });

  it('shows the money exactly as the server sends it, with the payment and the refunds', async () => {
    fixture.componentRef.setInput(
      'detail',
      disputeDetail({
        priceAmount: 800,
        refundedAmount: 200,
        refunds: [{ refundId: 'r-1', amount: 200, reason: 'LateCancel', status: 'Completed', requestedAtUtc: '2026-10-14T03:00:00Z', completedAtUtc: null }],
        isPackageBooking: true,
      }),
    );
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('฿800.00');
    expect(text).toContain('฿200.00');
    expect(text).toContain('PromptPay · Succeeded');
    expect(text).toContain('Refunded');
    expect(text).toContain('Booked with a package credit');
  });

  it('shows the tutor\'s record and how their other disputes went, with ways to open them', async () => {
    fixture.componentRef.setInput(
      'detail',
      disputeDetail({
        tutorHistory: {
          status: 'Verified',
          reliabilityScore: 80,
          ratingAverage: 4.25,
          ratingCount: 8,
          completedSessionsCount: 30,
          penalties: [{ kind: 'NoShow', points: 10, reasonCode: 'x', createdAtUtc: '2026-09-01T03:00:00Z', voided: true }],
          disputes90d: { total: 4, upheld: 2, noRefundOrRejected: 1 },
        },
      }),
    );
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('Verified');
    expect(text).toContain('4.3 (8)');
    expect(text).toContain('4 · 2 upheld');
    expect(text).toContain('No-show · 10');
    expect(text).toContain('voided');
    expect(root().querySelector('a[href="/admin/tutoring/tutors/tutor-1"]')).not.toBeNull();
    expect(root().querySelector('a[href^="/admin/tutoring/disputes?"]')?.getAttribute('href')).toContain('tutorId=tutor-1');
  });

  it('shows a payment-less booking and a tutor state it does not know without breaking', async () => {
    fixture.componentRef.setInput('detail', disputeDetail({ payment: null, tutorHistory: { ...disputeDetail().tutorHistory, status: 'Archived' } }));
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('Archived');
    expect(text).not.toContain('PromptPay');
  });
});
