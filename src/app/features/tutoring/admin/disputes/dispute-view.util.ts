import type { Locale } from '../../../../core/i18n/translation.service';
import type { DisputeStatus } from '../../data/tutoring-dispute.models';
import type { StatusView } from '../../../live/data/live-instructor.util';
import type { AdminDisputeListItem } from '../data/admin-dispute.models';
import { AWAITING_REPLY_VIEW, DISPUTE_STATUSES, ESCROW_TOO_LATE_VIEW, FOLLOW_UP_VIEW, OVERDUE_VIEW, REPEAT_COMPLAINT_VIEW, disputePriorityView } from '../data/admin-labels';

/** The queue's status filter in the URL: one status, `all`, or absent (= the server's default, the cases still open). */
export type StatusParam = DisputeStatus | 'all';
export const STATUS_PARAMS: readonly StatusParam[] = [...DISPUTE_STATUSES, 'all'];

/** The `status` list to send for a URL value; `null` leaves the choice to the server. */
export function statusParamToQuery(param: StatusParam | null): readonly DisputeStatus[] | undefined {
  if (param === null) {
    return undefined;
  }
  return param === 'all' ? DISPUTE_STATUSES : [param];
}

/** Open or being reviewed: the only states in which a case can still be claimed, answered to the parties or decided. */
export function isActiveDispute(status: DisputeStatus): boolean {
  return status === 'Open' || status === 'UnderReview';
}

/** The last word was a party's, not an administrator's: the case is waiting for us. */
export function isAwaitingAdmin(item: Pick<AdminDisputeListItem, 'status' | 'lastMessageRole'>): boolean {
  return isActiveDispute(item.status) && (item.lastMessageRole === 'Learner' || item.lastMessageRole === 'Tutor');
}

/** The small chips beside a queued case: priority first, then what asks for attention. Each is the server's flag, not a derivation. */
export function rowFlags(item: AdminDisputeListItem): readonly StatusView[] {
  const flags: StatusView[] = [];
  const priority = disputePriorityView(item.priority);
  if (priority !== null) {
    flags.push(priority);
  }
  if (item.isOverdue) {
    flags.push(OVERDUE_VIEW);
  }
  if (isAwaitingAdmin(item)) {
    flags.push(AWAITING_REPLY_VIEW);
  }
  if (item.repeatComplaintFlag) {
    flags.push(REPEAT_COMPLAINT_VIEW);
  }
  if (item.compensationRequired && !item.compensationSettled) {
    flags.push(FOLLOW_UP_VIEW);
  }
  if (item.escrowFreeze === 'TooLate') {
    flags.push(ESCROW_TOO_LATE_VIEW);
  }
  return flags;
}

/** An amount in baht for a sentence (a pipe cannot be used inside a translated string's parameters). */
export function formatBaht(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol' }).format(amount);
}
