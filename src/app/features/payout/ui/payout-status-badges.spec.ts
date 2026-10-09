import en from '../../../core/i18n/en.json';
import th from '../../../core/i18n/th.json';
import { PayoutBatchItemStatus, PayoutBatchStatus, REVENUE_SPLIT_STATUSES, RevenueSplitStatus } from '../data/payout-api.models';
import {
  PayoutStatusBadge,
  payoutBatchItemStatusBadge,
  payoutBatchStatusBadge,
  revenueSplitStatusBadge,
} from './payout-status-badges';

/** Walks `a.b.c` through a nested i18n dictionary (the JSON files are nested, not flat). */
function resolveKey(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

// The exact members of the backend enums (Siri.Modules.Payout/Domain/*Status.cs) — keep in sync with them.
const BATCH_STATUSES: readonly PayoutBatchStatus[] = ['Draft', 'Executed', 'Failed'];
const BATCH_ITEM_STATUSES: readonly PayoutBatchItemStatus[] = ['Pending', 'Transferred', 'Failed'];
const SPLIT_STATUSES: readonly RevenueSplitStatus[] = ['Pending', 'Payable', 'Paid', 'Reversed'];

describe('payout status badges', () => {
  it('REVENUE_SPLIT_STATUSES mirrors the backend RevenueSplitStatus enum exactly (no Voided / Processing)', () => {
    expect([...REVENUE_SPLIT_STATUSES]).toEqual([...SPLIT_STATUSES]);
  });

  interface EnumCase {
    readonly enumName: string;
    readonly statuses: readonly string[];
    readonly badgeFor: (status: string) => PayoutStatusBadge;
  }

  const cases: readonly EnumCase[] = [
    { enumName: 'PayoutBatchStatus', statuses: BATCH_STATUSES, badgeFor: payoutBatchStatusBadge },
    { enumName: 'PayoutBatchItemStatus', statuses: BATCH_ITEM_STATUSES, badgeFor: payoutBatchItemStatusBadge },
    { enumName: 'RevenueSplitStatus', statuses: SPLIT_STATUSES, badgeFor: revenueSplitStatusBadge },
  ];

  for (const { enumName, statuses, badgeFor } of cases) {
    describe(enumName, () => {
      it('gives every real backend value its own icon and label (never colour alone)', () => {
        const badges = statuses.map((status) => badgeFor(status));
        for (const badge of badges) {
          expect(badge.labelKey).not.toBeNull();
          expect(badge.icon).toMatch(/^phosphor/);
        }
        expect(new Set(badges.map((b) => b.labelKey)).size).toBe(statuses.length);
      });

      it('points every label at an i18n key that exists in both th.json and en.json', () => {
        for (const status of statuses) {
          const key = badgeFor(status).labelKey;
          expect(key).not.toBeNull();
          expect(typeof resolveKey(th, key ?? ''), `th ${key}`).toBe('string');
          expect(typeof resolveKey(en, key ?? ''), `en ${key}`).toBe('string');
        }
      });

      it('shows a status the backend never sends as an unknown badge (raw text, question icon), not as a real state', () => {
        for (const bogus of ['Paid ', 'Voided', 'Processing', 'paid', '', 'toString', '__proto__']) {
          if (statuses.includes(bogus)) {
            continue;
          }
          const badge = badgeFor(bogus);
          expect(badge.labelKey, `labelKey for "${bogus}"`).toBeNull();
          expect(badge.icon).toBe('phosphorQuestion');
        }
      });
    });
  }

  it('maps the values that used to be compared against the wrong strings', () => {
    // The instructor history row of a completed transfer is `Transferred`, never `Paid`.
    expect(payoutBatchItemStatusBadge('Transferred').labelKey).toBe('instructor.earnings.status.transferred');
    expect(payoutBatchItemStatusBadge('Paid').labelKey).toBeNull();
    // An executed batch is `Executed`, a fresh one `Draft` — never `Paid` / `Pending` / `Processing`.
    expect(payoutBatchStatusBadge('Executed').labelKey).toBe('admin.payouts.batchStatus.executed');
    expect(payoutBatchStatusBadge('Draft').labelKey).toBe('admin.payouts.batchStatus.draft');
    expect(payoutBatchStatusBadge('Paid').labelKey).toBeNull();
    expect(payoutBatchStatusBadge('Pending').labelKey).toBeNull();
    expect(payoutBatchStatusBadge('Processing').labelKey).toBeNull();
    // A revenue split is `Reversed`, never `Voided`.
    expect(revenueSplitStatusBadge('Reversed').labelKey).toBe('admin.payouts.splitStatus.reversed');
    expect(revenueSplitStatusBadge('Voided').labelKey).toBeNull();
  });
});
