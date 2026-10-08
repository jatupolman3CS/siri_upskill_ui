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
  readonly status: string;
  readonly createdAtUtc: string;
}

export interface InstructorPayoutAccount {
  readonly id: string;
  readonly instructorId: string;
  readonly bankCode: string;
  readonly bankAccountNumberMasked: string;
  readonly accountHolderName: string;
  readonly isVerified: boolean;
}

export interface PayoutBatchItemDetail {
  readonly id: string;
  readonly instructorId: string;
  readonly amount: number;
  readonly withholdingTaxPercent: number;
  readonly withholdingTaxAmount: number;
  readonly netAmount: number;
  readonly status: string;
  readonly transferRef?: string | null;
}

export interface PayoutBatchItem {
  readonly id: string;
  readonly periodKey: string;
  readonly totalAmount: number;
  readonly status: string;
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
  readonly status: string;
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
