import { type DecisionForm, EMPTY_DECISION_FORM, buildDecideRequest, consequenceKeys, decisionIssues, outcomesFor } from './dispute-decision.util';

const form = (patch: Partial<DecisionForm>): DecisionForm => ({ ...EMPTY_DECISION_FORM, note: 'Both sides were heard.', ...patch });
const context = { escrowFreeze: 'Frozen' as const, isPackageBooking: false };

describe('dispute decision helpers', () => {
  it('offers money outcomes only to a payment dispute, and only accept / reject to an attendance appeal', () => {
    expect(outcomesFor('Escrow')).toEqual(['FullRefund', 'PartialRefund', 'NoRefund', 'Reject']);
    expect(outcomesFor('AttendanceAppeal')).toEqual(['Resolve', 'Reject']);
  });

  describe('decisionIssues', () => {
    it('needs an outcome and a note of 3 to 1000 characters', () => {
      expect(Object.keys(decisionIssues(EMPTY_DECISION_FORM)).sort()).toEqual(['note', 'outcome']);
      expect(decisionIssues(form({ outcome: 'NoRefund', note: 'ab' })).note?.key).toBe('tutoring.tutor.validation.tooShort');
      expect(decisionIssues(form({ outcome: 'NoRefund', note: 'x'.repeat(1001) })).note?.key).toBe('tutoring.tutor.validation.tooLong');
      expect(decisionIssues(form({ outcome: 'NoRefund' }))).toEqual({});
    });

    it('needs a positive amount with at most two decimals for a partial refund, and no cap check (the server owns it)', () => {
      expect(decisionIssues(form({ outcome: 'PartialRefund', amount: '' })).amount?.key).toBe('tutoring.tutor.validation.required');
      expect(decisionIssues(form({ outcome: 'PartialRefund', amount: 'abc' })).amount?.key).toBe('tutoring.tutor.validation.notANumber');
      expect(decisionIssues(form({ outcome: 'PartialRefund', amount: '10.123' })).amount?.key).toBe('tutoring.tutor.validation.tooManyDecimals');
      expect(decisionIssues(form({ outcome: 'PartialRefund', amount: '0' })).amount?.key).toBe('tutoring.admin.disputes.decide.issue.amountPositive');
      expect(decisionIssues(form({ outcome: 'PartialRefund', amount: '99999' }))).toEqual({});
    });

    it('does not look at the amount for other outcomes', () => {
      expect(decisionIssues(form({ outcome: 'FullRefund', amount: 'garbage' }))).toEqual({});
    });

    it('needs a reason of 3 to 1000 characters when the tutor is also to be suspended', () => {
      expect(decisionIssues(form({ outcome: 'Reject', suspend: true })).suspendReason?.key).toBe('tutoring.tutor.validation.required');
      expect(decisionIssues(form({ outcome: 'Reject', suspend: true, suspendReason: 'ab' })).suspendReason?.key).toBe('tutoring.tutor.validation.tooShort');
      expect(decisionIssues(form({ outcome: 'Reject', suspend: true, suspendReason: 'Repeated abuse' }))).toEqual({});
      expect(decisionIssues(form({ outcome: 'Reject', suspend: false, suspendReason: '' }))).toEqual({});
    });
  });

  describe('buildDecideRequest', () => {
    it('maps a full refund to Resolve + FullRefund with no amount', () => {
      expect(buildDecideRequest('Escrow', form({ outcome: 'FullRefund', amount: '50' }))).toEqual({
        decision: 'Resolve',
        resolution: 'FullRefund',
        refundAmount: null,
        attendanceOverturned: false,
        compensationRequired: false,
        note: 'Both sides were heard.',
        suspendTutor: false,
        suspendReason: null,
      });
    });

    it('sends the parsed amount of a partial refund', () => {
      const request = buildDecideRequest('Escrow', form({ outcome: 'PartialRefund', amount: '250,50' }));
      expect(request.resolution).toBe('PartialRefund');
      expect(request.refundAmount).toBe(250.5);
    });

    it('maps a rejection to Reject with no resolution and no amount, in either flow', () => {
      for (const flow of ['Escrow', 'AttendanceAppeal'] as const) {
        const request = buildDecideRequest(flow, form({ outcome: 'Reject', amount: '10', overturned: true, compensation: true }));
        expect(request).toMatchObject({ decision: 'Reject', resolution: null, refundAmount: null, attendanceOverturned: false, compensationRequired: false });
      }
    });

    it('never sends money or a resolution for an attendance appeal, and the flags only for an accepted one', () => {
      const accepted = buildDecideRequest('AttendanceAppeal', form({ outcome: 'Resolve', overturned: true, compensation: true, amount: '99' }));
      expect(accepted).toMatchObject({ decision: 'Resolve', resolution: null, refundAmount: null, attendanceOverturned: true, compensationRequired: true });
    });

    it('never sends the appeal flags for a payment dispute', () => {
      const request = buildDecideRequest('Escrow', form({ outcome: 'NoRefund', overturned: true, compensation: true }));
      expect(request).toMatchObject({ resolution: 'NoRefund', attendanceOverturned: false, compensationRequired: false });
    });

    it('sends the suspension and its trimmed reason only when asked for', () => {
      expect(buildDecideRequest('Escrow', form({ outcome: 'NoRefund', suspend: true, suspendReason: '  Abuse  ' }))).toMatchObject({ suspendTutor: true, suspendReason: 'Abuse' });
      expect(buildDecideRequest('Escrow', form({ outcome: 'NoRefund', suspend: false, suspendReason: 'ignored' }))).toMatchObject({ suspendTutor: false, suspendReason: null });
    });
  });

  describe('consequenceKeys', () => {
    const base = 'tutoring.admin.disputes.decide.effect';

    it('says nothing until an outcome is chosen', () => {
      expect(consequenceKeys('Escrow', EMPTY_DECISION_FORM, context)).toEqual([]);
    });

    it('always ends by saying both parties read the note', () => {
      for (const outcome of ['FullRefund', 'PartialRefund', 'NoRefund', 'Reject'] as const) {
        expect(consequenceKeys('Escrow', form({ outcome }), context).at(-1)).toBe(`${base}.bothSee`);
      }
    });

    it('describes each payment outcome', () => {
      expect(consequenceKeys('Escrow', form({ outcome: 'FullRefund' }), context)[0]).toBe(`${base}.FullRefund`);
      expect(consequenceKeys('Escrow', form({ outcome: 'PartialRefund' }), context)[0]).toBe(`${base}.PartialRefund`);
      expect(consequenceKeys('Escrow', form({ outcome: 'NoRefund' }), context)[0]).toBe(`${base}.NoRefund`);
      expect(consequenceKeys('Escrow', form({ outcome: 'Reject' }), context)[0]).toBe(`${base}.RejectEscrow`);
    });

    it('warns that a refund of money already paid out comes from the tutor\'s next earnings', () => {
      const tooLate = { escrowFreeze: 'TooLate' as const, isPackageBooking: false };
      expect(consequenceKeys('Escrow', form({ outcome: 'FullRefund' }), tooLate)).toContain(`${base}.tooLate`);
      expect(consequenceKeys('Escrow', form({ outcome: 'PartialRefund' }), tooLate)).toContain(`${base}.tooLate`);
      expect(consequenceKeys('Escrow', form({ outcome: 'NoRefund' }), tooLate)).not.toContain(`${base}.tooLate`);
    });

    it('mentions the package credit only for a full refund of a package booking', () => {
      const pack = { escrowFreeze: 'Frozen' as const, isPackageBooking: true };
      expect(consequenceKeys('Escrow', form({ outcome: 'FullRefund' }), pack)).toContain(`${base}.packageCredit`);
      expect(consequenceKeys('Escrow', form({ outcome: 'PartialRefund' }), pack)).not.toContain(`${base}.packageCredit`);
    });

    it('describes an appeal, the penalty being voided and the compensation that is paid outside the system', () => {
      const keys = consequenceKeys('AttendanceAppeal', form({ outcome: 'Resolve', overturned: true, compensation: true }), context);
      expect(keys).toEqual([`${base}.ResolveAppeal`, `${base}.overturn`, `${base}.compensation`, `${base}.bothSee`]);
      expect(consequenceKeys('AttendanceAppeal', form({ outcome: 'Reject', overturned: true }), context)).toEqual([`${base}.RejectAppeal`, `${base}.bothSee`]);
    });

    it('mentions the suspension when it was asked for', () => {
      expect(consequenceKeys('Escrow', form({ outcome: 'NoRefund', suspend: true }), context)).toContain(`${base}.suspend`);
    });
  });
});
