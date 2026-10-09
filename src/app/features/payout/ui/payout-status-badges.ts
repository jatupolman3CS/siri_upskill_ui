import { PayoutBatchItemStatus, PayoutBatchStatus, RevenueSplitStatus } from '../data/payout-api.models';

/**
 * How one backend status value is shown in the payout tables (admin batches / splits, instructor history): an i18n
 * label, an icon and a badge colour. The icon + label carry the meaning; the colour only reinforces it (never
 * colour alone). Each map is keyed by the backend enum itself (`Siri.Modules.Payout.Domain.*Status`), so adding or
 * removing a member there is a compile error here rather than a silently wrong badge.
 *
 * Icons referenced below must be registered with `provideIcons()` by the component that renders the badge.
 */
export interface PayoutStatusBadge {
  /** `null` only for a value the backend does not define — the caller then prints the raw status text. */
  readonly labelKey: string | null;
  readonly icon: string;
  readonly badgeClass: string;
}

const AMBER = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
const SKY = 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20';
const EMERALD = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
const ROSE = 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20';
const NEUTRAL = 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] border-[var(--color-border)]';

/** `PayoutBatchStatus` — the whole run: created `Draft`, then `Executed` (or `Failed`). */
const BATCH_STATUS_BADGES: Readonly<Record<PayoutBatchStatus, PayoutStatusBadge>> = {
  Draft: { labelKey: 'admin.payouts.batchStatus.draft', icon: 'phosphorClock', badgeClass: SKY },
  Executed: { labelKey: 'admin.payouts.batchStatus.executed', icon: 'phosphorCheckCircle', badgeClass: EMERALD },
  Failed: { labelKey: 'admin.payouts.batchStatus.failed', icon: 'phosphorXCircle', badgeClass: ROSE },
};

/** `RevenueSplitStatus` — one order item's instructor share. */
const SPLIT_STATUS_BADGES: Readonly<Record<RevenueSplitStatus, PayoutStatusBadge>> = {
  Pending: { labelKey: 'admin.payouts.splitStatus.pending', icon: 'phosphorClock', badgeClass: AMBER },
  Payable: { labelKey: 'admin.payouts.splitStatus.payable', icon: 'phosphorHandCoins', badgeClass: SKY },
  Paid: { labelKey: 'admin.payouts.splitStatus.paid', icon: 'phosphorCheckCircle', badgeClass: EMERALD },
  Reversed: { labelKey: 'admin.payouts.splitStatus.reversed', icon: 'phosphorArrowCounterClockwise', badgeClass: NEUTRAL },
};

/** `PayoutBatchItemStatus` — one instructor's transfer inside a batch (also every row of the instructor history). */
const BATCH_ITEM_STATUS_BADGES: Readonly<Record<PayoutBatchItemStatus, PayoutStatusBadge>> = {
  Pending: { labelKey: 'instructor.earnings.status.pending', icon: 'phosphorClock', badgeClass: AMBER },
  Transferred: { labelKey: 'instructor.earnings.status.transferred', icon: 'phosphorCheckCircle', badgeClass: EMERALD },
  Failed: { labelKey: 'instructor.earnings.status.failed', icon: 'phosphorXCircle', badgeClass: ROSE },
};

const UNKNOWN_STATUS_BADGE: PayoutStatusBadge = { labelKey: null, icon: 'phosphorQuestion', badgeClass: NEUTRAL };

// The wire value is a plain string at runtime; an unexpected one must render as "unknown" (raw text), never be
// mistaken for a real state (e.g. fall through to "pending").
function lookup(badges: Readonly<Record<string, PayoutStatusBadge | undefined>>, status: string): PayoutStatusBadge {
  return Object.hasOwn(badges, status) ? (badges[status] ?? UNKNOWN_STATUS_BADGE) : UNKNOWN_STATUS_BADGE;
}

export function payoutBatchStatusBadge(status: string): PayoutStatusBadge {
  return lookup(BATCH_STATUS_BADGES, status);
}

export function revenueSplitStatusBadge(status: string): PayoutStatusBadge {
  return lookup(SPLIT_STATUS_BADGES, status);
}

export function payoutBatchItemStatusBadge(status: string): PayoutStatusBadge {
  return lookup(BATCH_ITEM_STATUS_BADGES, status);
}
