/**
 * `Siri.Modules.Payout.Domain.RevenueSplitStatus` — serialized by name through the host's global
 * `JsonStringEnumConverter`, and the only values `GET /api/payout/admin/revenue-splits?status=` binds (anything else
 * is a 400). Mirror the backend enum exactly; do not add UI-only states here.
 */
export const REVENUE_SPLIT_STATUSES = ['Pending', 'Payable', 'Paid', 'Reversed'] as const;
export type RevenueSplitStatus = (typeof REVENUE_SPLIT_STATUSES)[number];

export function isRevenueSplitStatus(value: unknown): value is RevenueSplitStatus {
  return typeof value === 'string' && (REVENUE_SPLIT_STATUSES as readonly string[]).includes(value);
}

/** `Siri.Modules.Payout.Domain.PayoutBatchStatus` — a batch is created as `Draft`, then `Executed` (or `Failed`). */
export type PayoutBatchStatus = 'Draft' | 'Executed' | 'Failed';

/**
 * `Siri.Modules.Payout.Domain.PayoutBatchItemStatus` — one instructor's transfer inside a batch. Also the `status` of
 * every `PayoutHistoryItem` (the instructor history is one row per batch item).
 */
export type PayoutBatchItemStatus = 'Pending' | 'Transferred' | 'Failed';

export interface RevenueSplitItem {
  readonly id: string;
  readonly orderId?: string;
  readonly orderItemId: string;
  readonly instructorId: string;
  readonly grossAmount: number;
  readonly platformFeeAmount: number;
  readonly paymentFeeAmount: number;
  readonly instructorAmount: number;
  readonly revenueSharePercent?: number;
  readonly periodKey?: string;
  readonly status: RevenueSplitStatus;
  readonly createdAtUtc: string;
}

/** `Siri.Modules.Payout.Domain.TaxPayerType` — serialized by name through the host's global `JsonStringEnumConverter`. */
export type TaxPayerType = 'Individual' | 'Corporate';

/**
 * `InstructorPayoutAccountResponse` (`Siri.Modules.Payout/Application/InstructorPayoutAccountModels.cs`), returned by
 * `GET`/`POST`/`PUT /api/payout/instructor/payout-account`. The account number and tax id arrive already MASKED
 * (`***-***-1234`) — the full values are never sent back. `verifiedAtUtc` is `null` until an admin verifies the
 * account, and returns to `null` whenever the bank, account number, account name or tax id is changed.
 */
export interface InstructorPayoutAccount {
  readonly id: string;
  readonly instructorId: string;
  readonly bankCode: string;
  readonly maskedAccountNo: string;
  readonly accountName: string;
  readonly taxId: string | null;
  readonly taxPayerType: TaxPayerType;
  readonly verifiedAtUtc: string | null;
}

/**
 * `CreateInstructorPayoutAccountCommand` — the body of `PUT` (upsert) and `POST` (create) on
 * `/api/payout/instructor/payout-account`. Server rules (`CreateInstructorPayoutAccountValidator`): `bankCode` required,
 * max 20; `accountNo` required, max 34; `accountName` required, max 200; `taxId` optional, max 20; `taxPayerType` must be
 * a defined enum value. The caller is always the authenticated user — there is no instructor id in the body.
 */
export interface UpsertPayoutAccountRequest {
  readonly bankCode: string;
  readonly accountNo: string;
  readonly accountName: string;
  readonly taxId: string | null;
  readonly taxPayerType: TaxPayerType;
}

export interface PayoutBatchItemDetail {
  readonly id: string;
  readonly instructorId: string;
  readonly amount: number;
  readonly withholdingTaxPercent: number;
  readonly withholdingTaxAmount: number;
  readonly netAmount: number;
  readonly status: PayoutBatchItemStatus;
  readonly transferRef?: string | null;
}

export interface PayoutBatchItem {
  readonly id: string;
  readonly periodKey: string;
  readonly totalAmount: number;
  readonly status: PayoutBatchStatus;
  readonly createdAtUtc: string;
  readonly executedAtUtc?: string | null;
  readonly executedByUserId?: string | null;
  readonly items?: readonly PayoutBatchItemDetail[];
}

export interface CreatePayoutBatchRequest {
  readonly periodKey: string;
}

export interface PayoutHistoryItem {
  readonly payoutId: string;
  readonly batchNumber: string;
  readonly grossAmount: number;
  readonly netAmount: number;
  readonly withholdingTaxAmount: number;
  readonly periodEndUtc: string;
  readonly status: PayoutBatchItemStatus;
  /** The batch's `executedAtUtc` — `null` until the batch is executed, i.e. set exactly when the item is `Transferred`. */
  readonly paidAtUtc?: string | null;
}

export interface InstructorEarningsSummary {
  readonly cumulativeEarnings: number;
  readonly latestPayoutAmount: number;
  readonly estimatedNextPayoutAmount: number;
  readonly history: readonly PayoutHistoryItem[];
}

/**
 * `GET /api/payout/policy` — server-owned revenue-policy figures. `revenueSharePercent` is the caller's
 * own instructor share (or the system default for non-instructors/admins); the rest come from server
 * config. All percentages are whole-number percents (70 means 70%), not fractions. There is
 * deliberately NO payout date/cycle field: the backend has none (an admin creates a payout batch once
 * the hold period has passed and the instructor's balance reaches `minimumPayoutAmount`).
 */
export interface PayoutPolicy {
  readonly revenueSharePercent: number;
  readonly platformSharePercent: number;
  readonly withholdingTaxPercent: number;
  readonly minimumPayoutAmount: number;
  readonly holdDays: number;
}

export interface BatchExportResponse {
  readonly batchId: string;
  readonly periodKey: string;
  readonly totalAmount: number;
  readonly totalItems: number;
  readonly exportedAtUtc: string;
  readonly transferRecords: readonly {
    readonly instructorId: string;
    readonly accountName: string;
    readonly bankCode: string;
    readonly bankAccountNumber: string;
    readonly netAmount: number;
    readonly transferRef: string;
  }[];
}
