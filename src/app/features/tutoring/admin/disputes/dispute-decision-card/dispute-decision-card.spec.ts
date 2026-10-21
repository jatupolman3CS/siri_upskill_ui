import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminDisputeDecisionView } from '../../data/admin-dispute.models';
import { disputeDetail } from '../../testing/fixtures';
import { buttonByText, settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { DisputeDecisionCard } from './dispute-decision-card';

const DECISION: AdminDisputeDecisionView = {
  resolution: 'PartialRefund',
  refundAmount: 250,
  refundId: 'r-1',
  note: 'Half the class did not happen.',
  decidedAtUtc: '2026-10-15T03:00:00Z',
  decidedByUserId: 'admin-1',
  attendanceOverturned: false,
  penaltyVoided: false,
};

describe('DisputeDecisionCard', () => {
  let fixture: ComponentFixture<DisputeDecisionCard>;
  let decide: number;
  let settleClicks: number;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function render(overrides = {}): Promise<void> {
    fixture.componentRef.setInput('detail', disputeDetail(overrides));
    await settle(fixture);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    useEnglish();
    fixture = TestBed.createComponent(DisputeDecisionCard);
    decide = 0;
    settleClicks = 0;
    fixture.componentInstance.decide.subscribe(() => decide++);
    fixture.componentInstance.settle.subscribe(() => settleClicks++);
  });

  it('offers the decision only while the case is open', async () => {
    await render({ status: 'UnderReview' });
    expect(textOf(root())).toContain('Not decided yet.');
    (buttonByText(root(), 'Decide this dispute') as HTMLButtonElement).click();
    expect(decide).toBe(1);

    await render({ status: 'Withdrawn' });
    expect(buttonByText(root(), 'Decide this dispute')).toBeNull();
    expect(textOf(root())).toContain('This dispute is closed.');
  });

  it('shows what was decided: the kind, the refund the server recorded and the note both parties read', async () => {
    await render({ status: 'Resolved', decision: DECISION });
    const text = textOf(root());
    expect(text).toContain('Partial refund');
    expect(text).toContain('฿250.00');
    expect(text).toContain('Half the class did not happen.');
    expect(text).toContain('The learner and the tutor see this in the app.');
    expect(buttonByText(root(), 'Decide this dispute')).toBeNull();
  });

  it('says the decision was already on record when the server repeated it', async () => {
    await render({ status: 'Resolved', decision: DECISION, alreadyDecided: true });
    expect(textOf(root())).toContain('nothing was repeated');
  });

  it('reports what the optional suspension came to, and calls a failed one an alert', async () => {
    await render({ status: 'Resolved', decision: DECISION, tutorSuspension: 'Done' });
    expect(textOf(root())).toContain('The tutor was suspended.');
    await render({ status: 'Resolved', decision: DECISION, tutorSuspension: 'Failed' });
    expect(root().querySelector('p[role="alert"]')?.textContent).toContain('Suspending the tutor failed');
    await render({ status: 'Resolved', decision: DECISION, tutorSuspension: 'NotRequested' });
    expect(textOf(root())).not.toContain('suspended');
  });

  it('shows what an accepted appeal changed', async () => {
    await render({ flow: 'AttendanceAppeal', status: 'Resolved', decision: { ...DECISION, resolution: 'NoRefund', refundAmount: null, attendanceOverturned: true, penaltyVoided: true } });
    const text = textOf(root());
    expect(text).toContain('No-show overturned.');
    expect(text).toContain('Penalty voided.');
    expect(text).not.toContain('฿');
  });

  it('offers to close an open compensation follow-up, and shows a closed one as done', async () => {
    await render({ status: 'Resolved', decision: DECISION, compensationRequired: true, compensationSettled: false });
    expect(textOf(root())).toContain('must be compensated outside the system');
    (buttonByText(root(), 'Compensation done') as HTMLButtonElement).click();
    expect(settleClicks).toBe(1);

    await render({ status: 'Resolved', decision: DECISION, compensationRequired: true, compensationSettled: true });
    expect(buttonByText(root(), 'Compensation done')).toBeNull();
    expect(textOf(root())).toContain('Compensation closed.');
  });
});
