import { disputePriorityView, disputeStatusView, kycCaseStatusView, kycDocumentStatusView, kycWaitingView, tutorStatusView, activeStateView, disputeHintKey } from './admin-labels';

describe('administrator status views', () => {
  it('gives every KYC case status an icon, a label key and a tone (meaning never rests on colour alone)', () => {
    for (const status of ['Draft', 'Submitted', 'InReview', 'NeedsInfo', 'Approved', 'Rejected'] as const) {
      const view = kycCaseStatusView(status);
      expect(view.labelKey).toBe(`tutoring.enums.kycCaseStatus.${status}`);
      expect(view.icon).toMatch(/^phosphor/);
    }
    expect(kycCaseStatusView('Approved').tone).toBe('success');
    expect(kycCaseStatusView('Rejected').tone).toBe('danger');
    expect(kycCaseStatusView('NeedsInfo').tone).toBe('warning');
  });

  it('tints a document verdict', () => {
    expect(kycDocumentStatusView('Approved').tone).toBe('success');
    expect(kycDocumentStatusView('Rejected').tone).toBe('danger');
    expect(kycDocumentStatusView('Pending').tone).toBe('info');
  });

  it('shows a suspended tutor as a problem and a verified one as fine', () => {
    expect(tutorStatusView('Suspended')).toEqual({ labelKey: 'tutoring.enums.tutorStatus.Suspended', icon: 'phosphorProhibit', tone: 'danger' });
    expect(tutorStatusView('Verified').tone).toBe('success');
    expect(tutorStatusView('Draft').tone).toBe('neutral');
  });

  it('shows a decided dispute as closed and an open one as asking for attention', () => {
    expect(disputeStatusView('Open').tone).toBe('warning');
    expect(disputeStatusView('UnderReview').tone).toBe('info');
    expect(disputeStatusView('Resolved').tone).toBe('success');
    expect(disputeStatusView('Withdrawn').tone).toBe('neutral');
  });

  it('only flags a high priority', () => {
    expect(disputePriorityView('Normal')).toBeNull();
    expect(disputePriorityView('High')?.tone).toBe('danger');
  });

  it('tints the wait: a day is worth a look, three days is late', () => {
    expect(kycWaitingView(5).tone).toBe('neutral');
    expect(kycWaitingView(24).tone).toBe('warning');
    expect(kycWaitingView(71).tone).toBe('warning');
    expect(kycWaitingView(72).tone).toBe('danger');
  });

  it('labels an active and an inactive subject', () => {
    expect(activeStateView(true).tone).toBe('success');
    expect(activeStateView(false).tone).toBe('neutral');
  });

  it('shows a hint the client knows and drops one it does not', () => {
    expect(disputeHintKey('minor_learner')).toBe('tutoring.admin.disputes.hint.minor_learner');
    expect(disputeHintKey('something_new')).toBeNull();
  });
});
