export type OrderStatus = 'Pending' | 'AwaitingPayment' | 'Paid' | 'Failed' | 'Cancelled' | 'Refunded';

export type PaymentMethod = 'PromptPay' | 'Card';

export type PaymentStatus = 'Pending' | 'Processing' | 'Succeeded' | 'Failed' | 'Expired' | 'Refunded';

export interface OrderItemDto {
  readonly id: string;
  readonly courseId?: string;
  readonly titleSnapshot: string;
  readonly instructorName?: string;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly thumbnailUrl?: string;
}

export interface OrderDetailResponse {
  readonly id: string;
  readonly orderNo: string;
  readonly subtotalAmount: number;
  readonly discountAmount: number;
  readonly taxAmount: number;
  readonly totalAmount: number;
  readonly currency: string;
  readonly status: OrderStatus;
  readonly items: readonly OrderItemDto[];
  readonly createdAtUtc?: string;
  readonly paidAtUtc?: string;
  readonly expiresAtUtc?: string;
}

export interface PaymentResponse {
  readonly id: string;
  readonly orderId: string;
  readonly method: PaymentMethod;
  readonly amount: number;
  readonly status: PaymentStatus;
  readonly createdAtUtc: string;
  readonly clientSecret?: string;
  readonly qrCodeUrl?: string;
  readonly qrCodeData?: string;
}

export interface CreatePaymentCommand {
  readonly orderId: string;
  readonly method: PaymentMethod;
}

/** `GET /api/commerce/payments/config` (`P11-09`) — the Stripe publishable key plus the
 * operational on/off switch for which payment methods are enabled right now. `enabledMethods`
 * can in theory be empty (misconfiguration) — callers must handle that by hiding every method
 * tab rather than assuming at least one entry, per the contract's §3. */
export interface PaymentConfigResponse {
  readonly publishableKey: string;
  readonly enabledMethods: readonly PaymentMethod[];
}

export interface CreateOrderCommand {
  readonly courseIds: readonly string[];
  readonly promoCode?: string;
}

export interface ValidatePromoCodeCommand {
  readonly code: string;
  readonly courseIds: readonly string[];
}

export interface PromoCodeValidationResponse {
  readonly isValid: boolean;
  readonly code: string;
  readonly discountType?: 'Fixed' | 'Percentage';
  readonly discountValue?: number;
  readonly subtotal: number;
  readonly discountAmount: number;
  readonly totalAmount: number;
  readonly errorMessage?: string;
}

export type TaxInvoiceStatus = 'Issued' | 'Voided';

export interface TaxInvoiceResponse {
  readonly id: string;
  readonly orderId: string;
  readonly buyerName: string;
  readonly invoiceNo: string;
  readonly issuedAtUtc: string;
  readonly pdfStorageKey?: string;
  readonly status: TaxInvoiceStatus;
}

export interface RequestRefundCommand {
  readonly paymentId: string;
  readonly reason: string;
}

export type RefundStatus = 'Pending' | 'Approved' | 'Rejected' | 'Processing' | 'Succeeded' | 'Failed';

export interface RefundResponse {
  readonly id: string;
  readonly paymentId: string;
  readonly amount: number;
  readonly reason: string;
  readonly status: RefundStatus;
  readonly requestedAtUtc: string;
  readonly decidedAtUtc?: string;
  readonly decisionNotes?: string;
}

export interface BundleItemResponse {
  readonly courseId: string;
}

export interface BundleResponse {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly price: number;
  readonly isActive: boolean;
  readonly startsAtUtc: string | null;
  readonly endsAtUtc: string | null;
  readonly items: readonly BundleItemResponse[];
}

export interface FlashSaleItemResponse {
  readonly id: string;
  readonly courseId: string;
  readonly salePrice: number;
}

export interface FlashSaleResponse {
  readonly id: string;
  readonly title: string;
  readonly startsAtUtc: string;
  readonly endsAtUtc: string;
  readonly isActive: boolean;
  readonly items: readonly FlashSaleItemResponse[];
}
