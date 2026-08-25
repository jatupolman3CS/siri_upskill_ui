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
