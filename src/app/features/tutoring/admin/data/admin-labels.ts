import type { StatusView } from '../../../live/data/live-instructor.util';
import type { DisputeCategory, DisputeFlow, DisputeStatus } from '../../data/tutoring-dispute.models';
import type { KycCaseStatus, KycDocumentStatus } from '../../data/tutoring-kyc.models';
import type { TutorStatus } from '../../data/tutoring-tutor.models';
import type { DisputeHint, DisputePriority, DisputeSort } from './admin-dispute.models';

/**
 * Closed enums of the administrator screens, the i18n keys that label them and the chip look of each state (icon + text + tint:
 * meaning is never carried by colour alone). The labels of the shared enums (`tutorStatus`, `kycCaseStatus`, `disputeStatus`,
 * ...) are the ones the tutor and learner screens already use; keys are built at runtime, so `admin-labels.spec.ts` asserts
 * every value resolves in both dictionaries.
 */
export const KYC_QUEUE_STATUSES: readonly KycCaseStatus[] = ['Submitted', 'InReview', 'NeedsInfo', 'Approved', 'Rejected', 'Draft'];
/** What the queue shows when no status is chosen: the cases that wait for a decision. */
export const KYC_WAITING_STATUSES: readonly KycCaseStatus[] = ['Submitted', 'InReview'];
export const ADMIN_TUTOR_STATUSES: readonly TutorStatus[] = ['PendingVerification', 'NeedsInfo', 'Verified', 'Suspended', 'Rejected', 'Draft'];
export const DISPUTE_STATUSES: readonly DisputeStatus[] = ['Open', 'UnderReview', 'Resolved', 'Rejected', 'Withdrawn'];
/** What the dispute queue shows when no status is chosen (the server's own default). */
export const DISPUTE_ACTIVE_STATUSES: readonly DisputeStatus[] = ['Open', 'UnderReview'];
export const DISPUTE_CATEGORIES: readonly DisputeCategory[] = ['NoClass', 'TutorConnection', 'Behavior', 'NotAsDescribed', 'Other'];
export const DISPUTE_FLOWS: readonly DisputeFlow[] = ['Escrow', 'AttendanceAppeal'];
export const DISPUTE_PRIORITIES: readonly DisputePriority[] = ['High', 'Normal'];
export const DISPUTE_SORTS: readonly DisputeSort[] = ['sla', 'newest', 'oldest', 'activity'];
export const DISPUTE_HINTS: readonly DisputeHint[] = [
  'minor_learner',
  'behavior_complaint',
  'repeat_complaint',
  'tutor_suspended',
  'learner_repeat_rejected',
  'appeal_penalty_exists',
];

export const disputePriorityKey = (priority: DisputePriority): string => `tutoring.admin.disputes.priority.${priority}`;
export const disputeSortKey = (sort: DisputeSort): string => `tutoring.admin.disputes.sort.${sort}`;

/** The text of a hint code; a code this client does not know yet is simply not shown. */
export function disputeHintKey(code: string): string | null {
  return (DISPUTE_HINTS as readonly string[]).includes(code) ? `tutoring.admin.disputes.hint.${code}` : null;
}

export function kycCaseStatusView(status: KycCaseStatus): StatusView {
  const labelKey = `tutoring.enums.kycCaseStatus.${status}`;
  switch (status) {
    case 'Submitted':
      return { labelKey, icon: 'phosphorHourglass', tone: 'info' };
    case 'InReview':
      return { labelKey, icon: 'phosphorMagnifyingGlass', tone: 'info' };
    case 'NeedsInfo':
      return { labelKey, icon: 'phosphorWarningCircle', tone: 'warning' };
    case 'Approved':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'success' };
    case 'Rejected':
      return { labelKey, icon: 'phosphorXCircle', tone: 'danger' };
    default:
      return { labelKey, icon: 'phosphorCircleDashed', tone: 'neutral' };
  }
}

export function kycDocumentStatusView(status: KycDocumentStatus): StatusView {
  const labelKey = `tutoring.enums.kycDocumentStatus.${status}`;
  switch (status) {
    case 'Approved':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'success' };
    case 'Rejected':
      return { labelKey, icon: 'phosphorXCircle', tone: 'danger' };
    default:
      return { labelKey, icon: 'phosphorHourglass', tone: 'info' };
  }
}

export function tutorStatusView(status: TutorStatus): StatusView {
  const labelKey = `tutoring.enums.tutorStatus.${status}`;
  switch (status) {
    case 'Verified':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'success' };
    case 'PendingVerification':
      return { labelKey, icon: 'phosphorHourglass', tone: 'info' };
    case 'NeedsInfo':
      return { labelKey, icon: 'phosphorWarningCircle', tone: 'warning' };
    case 'Rejected':
      return { labelKey, icon: 'phosphorXCircle', tone: 'danger' };
    case 'Suspended':
      return { labelKey, icon: 'phosphorProhibit', tone: 'danger' };
    default:
      return { labelKey, icon: 'phosphorCircleDashed', tone: 'neutral' };
  }
}

export function disputeStatusView(status: DisputeStatus): StatusView {
  // The administrator's own wording (the parties' texts soften "rejected" into "closed - no change").
  const labelKey = `tutoring.admin.disputes.status.${status}`;
  switch (status) {
    case 'Open':
      return { labelKey, icon: 'phosphorHourglass', tone: 'warning' };
    case 'UnderReview':
      return { labelKey, icon: 'phosphorMagnifyingGlass', tone: 'info' };
    case 'Resolved':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'success' };
    default:
      return { labelKey, icon: 'phosphorProhibit', tone: 'neutral' };
  }
}

/** A queued dispute's priority; `Normal` is the unremarkable default and has no chip. */
export function disputePriorityView(priority: DisputePriority): StatusView | null {
  return priority === 'High' ? { labelKey: disputePriorityKey('High'), icon: 'phosphorFlag', tone: 'danger' } : null;
}

/**
 * How long a KYC case has waited, as a chip. The tint is a reading aid only (a day is worth a look, three days is late): the
 * number of hours is always printed, and nothing is decided from it.
 */
export function kycWaitingView(waitingHours: number): StatusView {
  const tone = waitingHours >= 72 ? 'danger' : waitingHours >= 24 ? 'warning' : 'neutral';
  return { labelKey: 'tutoring.admin.kyc.waiting', icon: 'phosphorClock', tone };
}

/** The server's own `isOverdue` flag, as a chip. */
export const OVERDUE_VIEW: StatusView = { labelKey: 'tutoring.admin.disputes.overdue', icon: 'phosphorClock', tone: 'danger' };
export const REPEAT_COMPLAINT_VIEW: StatusView = { labelKey: 'tutoring.admin.disputes.repeatComplaint', icon: 'phosphorFlag', tone: 'warning' };
export const AWAITING_REPLY_VIEW: StatusView = { labelKey: 'tutoring.admin.disputes.awaitingReply', icon: 'phosphorHourglass', tone: 'info' };
export const FOLLOW_UP_VIEW: StatusView = { labelKey: 'tutoring.admin.disputes.followUp', icon: 'phosphorWarningCircle', tone: 'warning' };
export const ESCROW_TOO_LATE_VIEW: StatusView = { labelKey: 'tutoring.admin.disputes.tooLate', icon: 'phosphorWarningCircle', tone: 'warning' };

/** A subject that can (or cannot) be chosen for new offerings. */
export function activeStateView(isActive: boolean): StatusView {
  return isActive
    ? { labelKey: 'tutoring.admin.subjects.active', icon: 'phosphorCheckCircle', tone: 'success' }
    : { labelKey: 'tutoring.admin.subjects.inactive', icon: 'phosphorProhibit', tone: 'neutral' };
}

export const ADMIN_REVIEW_STATUSES: readonly ('Published' | 'Hidden')[] = ['Published', 'Hidden'];

export function reviewStatusView(status: 'Published' | 'Hidden'): StatusView {
  const labelKey = `tutoring.enums.reviewStatus.${status}`;
  return status === 'Published'
    ? { labelKey, icon: 'phosphorCheckCircle', tone: 'success' }
    : { labelKey, icon: 'phosphorProhibit', tone: 'neutral' };
}

