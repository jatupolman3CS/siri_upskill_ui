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

const GOLD = 'tone-gold bg-[var(--tone-bg)] text-[var(--tone-fg)] border-[var(--tone-fg)]/30';
const BLUE = 'tone-blue bg-[var(--tone-bg)] text-[var(--tone-fg)] border-[var(--tone-fg)]/30';
const GREEN = 'tone-green bg-[var(--tone-bg)] text-[var(--tone-fg)] border-[var(--tone-fg)]/30';
const RED = 'tone-red bg-[var(--tone-bg)] text-[var(--tone-fg)] border-[var(--tone-fg)]/30';
const NEUTRAL = 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] border-[var(--color-border)]';

/** `PayoutBatchStatus` — the whole run: created `Draft`, then `Executed` (or `Failed`). */
const BATCH_STATUS_BADGES: Readonly<Record<PayoutBatchStatus, PayoutStatusBadge>> = {
  Draft: { labelKey: 'admin.payouts.batchStatus.draft', icon: 'phosphorClock', badgeClass: BLUE },
  Executed: { labelKey: 'admin.payouts.batchStatus.executed', icon: 'phosphorCheckCircle', badgeClass: GREEN },
  Failed: { labelKey: 'admin.payouts.batchStatus.failed', icon: 'phosphorXCircle', badgeClass: RED },
};

/** `RevenueSplitStatus` — one order item's instructor share. */
const SPLIT_STATUS_BADGES: Readonly<Record<RevenueSplitStatus, PayoutStatusBadge>> = {
  Pending: { labelKey: 'admin.payouts.splitStatus.pending', icon: 'phosphorClock', badgeClass: GOLD },
  Payable: { labelKey: 'admin.payouts.splitStatus.payable', icon: 'phosphorHandCoins', badgeClass: BLUE },
  Paid: { labelKey: 'admin.payouts.splitStatus.paid', icon: 'phosphorCheckCircle', badgeClass: GREEN },
  Reversed: { labelKey: 'admin.payouts.splitStatus.reversed', icon: 'phosphorArrowCounterClockwise', badgeClass: NEUTRAL },
};

/** `PayoutBatchItemStatus` — one instructor's transfer inside a batch (also every row of the instructor history). */
const BATCH_ITEM_STATUS_BADGES: Readonly<Record<PayoutBatchItemStatus, PayoutStatusBadge>> = {
  Pending: { labelKey: 'instructor.earnings.status.pending', icon: 'phosphorClock', badgeClass: GOLD },
  Transferred: { labelKey: 'instructor.earnings.status.transferred', icon: 'phosphorCheckCircle', badgeClass: GREEN },
  Failed: { labelKey: 'instructor.earnings.status.failed', icon: 'phosphorXCircle', badgeClass: RED },
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
