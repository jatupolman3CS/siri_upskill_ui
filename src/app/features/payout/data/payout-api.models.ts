export interface RevenueSplitItem {
  readonly id: string;
  readonly orderId: string;
  readonly orderItemId: string;
  readonly instructorId: string;
  readonly grossAmount: number;
  readonly platformFeeAmount: number;
  readonly paymentFeeAmount: number;
  readonly instructorAmount: number;
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

export interface PayoutBatchItem {
  readonly id: string;
  readonly batchNumber: string;
  readonly periodStartUtc: string;
  readonly periodEndUtc: string;
  readonly totalAmount: number;
  readonly totalInstructors: number;
  readonly status: string;
  readonly executedAtUtc?: string | null;
  readonly createdAtUtc: string;
}

export interface CreatePayoutBatchRequest {
  readonly periodStartUtc: string;
  readonly periodEndUtc: string;
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

