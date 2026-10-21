import type { DisputeFlow, DisputeResolution } from '../../data/tutoring-dispute.models';
import { type FieldIssue, decimalPlaces, issue, parseNumber } from '../../ui/tutor-form.util';
import type { DecideDisputeRequest, EscrowFreezeResult } from '../data/admin-dispute.models';

export const NOTE_MIN = 3;
export const NOTE_MAX = 1000;
export const SUSPEND_REASON_MIN = 3;
export const SUSPEND_REASON_MAX = 1000;

/** What the administrator picks. `Escrow` cases can refund (fully, partly or not at all) or be rejected; an appeal can only be accepted or rejected. */
export type DecisionOutcome = 'FullRefund' | 'PartialRefund' | 'NoRefund' | 'Resolve' | 'Reject';

export function outcomesFor(flow: DisputeFlow): readonly DecisionOutcome[] {
  return flow === 'Escrow' ? ['FullRefund', 'PartialRefund', 'NoRefund', 'Reject'] : ['Resolve', 'Reject'];
}

export interface DecisionForm {
  readonly outcome: DecisionOutcome | null;
  /** The partial refund as typed. */
  readonly amount: string;
  /** Appeal only: the no-show is overturned (the tutor's penalty is voided). */
  readonly overturned: boolean;
  /** Appeal only: the tutor must be compensated outside the system. */
  readonly compensation: boolean;
  readonly note: string;
  readonly suspend: boolean;
  readonly suspendReason: string;
}

export const EMPTY_DECISION_FORM: DecisionForm = { outcome: null, amount: '', overturned: false, compensation: false, note: '', suspend: false, suspendReason: '' };

export type DecisionField = 'outcome' | 'amount' | 'note' | 'suspendReason';
export type DecisionIssues = Partial<Record<DecisionField, FieldIssue>>;

function lengthIssue(value: string, min: number, max: number): FieldIssue | undefined {
  const length = value.trim().length;
  if (length === 0) {
    return issue('tutoring.tutor.validation.required');
  }
  if (length < min) {
    return issue('tutoring.tutor.validation.tooShort', { min });
  }
  return length > max ? issue('tutoring.tutor.validation.tooLong', { max }) : undefined;
}

/**
 * What stops the decision being sent, as far as the client can tell. The refund's upper bound is deliberately NOT checked here:
 * only the server knows what is left to refund (it answers `409 tutoring.refund_exceeds_cap` with the limit).
 */
export function decisionIssues(form: DecisionForm): DecisionIssues {
  const issues: DecisionIssues = {};
  if (form.outcome === null) {
    issues.outcome = issue('tutoring.admin.disputes.decide.issue.outcome');
  }
  if (form.outcome === 'PartialRefund') {
    const amount = parseNumber(form.amount);
    if (amount === null) {
      issues.amount = issue('tutoring.tutor.validation.required');
    } else if (Number.isNaN(amount)) {
      issues.amount = issue('tutoring.tutor.validation.notANumber');
    } else if (decimalPlaces(amount) > 2) {
      issues.amount = issue('tutoring.tutor.validation.tooManyDecimals');
    } else if (amount <= 0) {
      issues.amount = issue('tutoring.admin.disputes.decide.issue.amountPositive');
    }
  }
  const note = lengthIssue(form.note, NOTE_MIN, NOTE_MAX);
  if (note !== undefined) {
    issues.note = note;
  }
  const suspendReason = form.suspend ? lengthIssue(form.suspendReason, SUSPEND_REASON_MIN, SUSPEND_REASON_MAX) : undefined;
  if (suspendReason !== undefined) {
    issues.suspendReason = suspendReason;
  }
  return issues;
}

/** The request for a valid form. A rejection and an appeal send no `resolution` / `refundAmount`; the appeal flags only apply to an accepted appeal. */
export function buildDecideRequest(flow: DisputeFlow, form: DecisionForm): DecideDisputeRequest {
  const rejected = form.outcome === 'Reject';
  const resolution: DisputeResolution | null = flow === 'Escrow' && (form.outcome === 'FullRefund' || form.outcome === 'PartialRefund' || form.outcome === 'NoRefund') ? form.outcome : null;
  const acceptedAppeal = flow === 'AttendanceAppeal' && form.outcome === 'Resolve';
  return {
    decision: rejected ? 'Reject' : 'Resolve',
    resolution,
    refundAmount: resolution === 'PartialRefund' ? (parseNumber(form.amount) ?? null) : null,
    attendanceOverturned: acceptedAppeal && form.overturned,
    compensationRequired: acceptedAppeal && form.compensation,
    note: form.note.trim(),
    suspendTutor: form.suspend,
    suspendReason: form.suspend ? form.suspendReason.trim() : null,
  };
}

/**
 * The i18n keys of the plain-language sentences that say what the chosen decision will DO, in the order they should be read.
 * Shown while choosing and again before the confirm button, so nobody refunds money or voids a penalty without having read it.
 */
export function consequenceKeys(
  flow: DisputeFlow,
  form: DecisionForm,
  context: { readonly escrowFreeze: EscrowFreezeResult; readonly isPackageBooking: boolean },
): readonly string[] {
  const keys: string[] = [];
  const base = 'tutoring.admin.disputes.decide.effect';
  if (form.outcome === null) {
    return keys;
  }
  if (flow === 'Escrow') {
    keys.push(form.outcome === 'Reject' ? `${base}.RejectEscrow` : `${base}.${form.outcome}`);
    if (form.outcome === 'FullRefund' && context.isPackageBooking) {
      keys.push(`${base}.packageCredit`);
    }
    if ((form.outcome === 'FullRefund' || form.outcome === 'PartialRefund') && context.escrowFreeze === 'TooLate') {
      keys.push(`${base}.tooLate`);
    }
  } else {
    keys.push(form.outcome === 'Reject' ? `${base}.RejectAppeal` : `${base}.ResolveAppeal`);
    if (form.outcome === 'Resolve' && form.overturned) {
      keys.push(`${base}.overturn`);
    }
    if (form.outcome === 'Resolve' && form.compensation) {
      keys.push(`${base}.compensation`);
    }
  }
  if (form.suspend) {
    keys.push(`${base}.suspend`);
  }
  keys.push(`${base}.bothSee`);
  return keys;
}
