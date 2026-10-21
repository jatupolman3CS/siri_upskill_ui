import type { StatusView } from '../../live/data/live-instructor.util';
import { BOUNDARY_SLACK_MS, MAX_TIMER_MS, msUntil } from '../../live/learner/live-clock';
import type { DisputeStatus } from './tutoring-dispute.models';
import { bookingStatusLabelKey, disputeStatusLabelKey } from './tutoring-labels';
import type { BookingListItem, BookingStatus, Guid, IsoUtc } from './tutoring-learner.models';

/**
 * Pure helpers of the learner's "My tutoring" screens. None of them decides anything the server owns (price, refund, who may
 * join, who may cancel): they pick wording, icons and timers for answers the server already gave.
 */

// --- Status -----------------------------------------------------------------------------------------------------------------

/** A booking status as a chip: label + icon + tone, never colour alone. Icons are registered by `StatusChip`. */
export function bookingStatusView(status: BookingStatus): StatusView {
  const labelKey = bookingStatusLabelKey(status);
  switch (status) {
    case 'PendingPayment':
      return { labelKey, icon: 'phosphorHourglass', tone: 'warning' };
    case 'Confirmed':
      return { labelKey, icon: 'phosphorCalendarBlank', tone: 'info' };
    case 'Completed':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'success' };
    case 'NoShowLearner':
    case 'NoShowTutor':
    case 'NoShowBoth':
    case 'Disputed':
      return { labelKey, icon: 'phosphorWarningCircle', tone: 'danger' };
    default:
      return { labelKey, icon: 'phosphorProhibit', tone: 'neutral' };
  }
}

/** A dispute status as a chip: label + icon + tone. */
export function disputeStatusView(status: DisputeStatus): StatusView {
  const labelKey = disputeStatusLabelKey(status);
  switch (status) {
    case 'Open':
    case 'UnderReview':
      return { labelKey, icon: 'phosphorHourglass', tone: 'info' };
    case 'Resolved':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'success' };
    case 'Rejected':
      return { labelKey, icon: 'phosphorXCircle', tone: 'neutral' };
    default:
      return { labelKey, icon: 'phosphorProhibit', tone: 'neutral' };
  }
}

/** Statuses after which money may have been refunded or may be on its way back. */
const REFUND_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'CancelledByLearner',
  'CancelledByTutor',
  'NoShowTutor',
  'NoShowBoth',
  'Disputed',
]);

/**
 * Whether it is worth asking the server for the refunds of this booking. A free trial never has any, and a booking that is still
 * live or finished normally has none. Only decides whether to LOOK; what the refunds are comes from the server.
 */
export function mayHaveRefund(booking: { readonly status: BookingStatus; readonly priceAmount: number }, refundedAmount = 0): boolean {
  return booking.priceAmount > 0 && (REFUND_STATUSES.has(booking.status) || refundedAmount > 0);
}

// --- Joining the class -------------------------------------------------------------------------------------------------------

/** Route of the join page for a class (`/tutoring/sessions/:sessionId/join`). */
export function joinRoute(sessionId: Guid): readonly string[] {
  return ['/tutoring', 'sessions', sessionId, 'join'];
}

export type JoinCue =
  /** The join window is open (server's `canJoin`): offer the link. */
  | { readonly kind: 'join' }
  /** The window opens later: show how long, and refetch when it does. */
  | { readonly kind: 'opens'; readonly opensAtUtc: IsoUtc }
  | { readonly kind: 'none' };

/**
 * What the join area of a booking should show. `canJoin` is the server's display hint at response time; a window that has not
 * opened yet is shown as a countdown on the server-corrected clock (`nowServerMs`), and the page refetches when it reaches zero so
 * the hint is the server's again. Entering the room is always decided by `POST sessions/{id}/join`, never by this.
 */
export function joinCue(
  booking: Pick<BookingListItem, 'status' | 'canJoin' | 'joinOpensAtUtc'>,
  nowServerMs: number,
): JoinCue {
  if (booking.status !== 'Confirmed') {
    return { kind: 'none' };
  }
  if (booking.canJoin) {
    return { kind: 'join' };
  }
  const opensAt = booking.joinOpensAtUtc === null ? Number.NaN : Date.parse(booking.joinOpensAtUtc);
  return !Number.isNaN(opensAt) && opensAt > nowServerMs ? { kind: 'opens', opensAtUtc: booking.joinOpensAtUtc as IsoUtc } : { kind: 'none' };
}

/**
 * Delay until the soonest join window of the listed bookings opens (so the list can ask the server again at that moment), or `null`
 * when none is pending or it is too far away for one timer. At least {@link BOUNDARY_SLACK_MS}, so a refetch loop can never spin
 * faster than once a second even if the two clocks disagree about the boundary.
 */
export function nextJoinOpensDelayMs(
  items: readonly Pick<BookingListItem, 'status' | 'joinOpensAtUtc'>[],
  offsetMs: number,
  deviceNowMs: number = Date.now(),
): number | null {
  let soonest: number | null = null;
  for (const item of items) {
    if (item.status !== 'Confirmed' || item.joinOpensAtUtc === null) {
      continue;
    }
    const remaining = msUntil(item.joinOpensAtUtc, offsetMs, deviceNowMs);
    if (remaining !== null && remaining > 0 && (soonest === null || remaining < soonest)) {
      soonest = remaining;
    }
  }
  if (soonest === null) {
    return null;
  }
  const delay = soonest + BOUNDARY_SLACK_MS;
  return delay > MAX_TIMER_MS ? null : delay;
}

// --- Idempotency keys --------------------------------------------------------------------------------------------------------

/**
 * A fresh client-generated id for an idempotent request (`clientRequestId` / `clientMessageId`). `crypto.randomUUID` needs a secure
 * context; the fallback builds a v4-shaped id from `getRandomValues`, which is available everywhere a browser runs this app.
 */
export function newClientId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
