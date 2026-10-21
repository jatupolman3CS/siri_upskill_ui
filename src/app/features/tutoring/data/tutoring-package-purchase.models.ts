/**
 * Learner-side package DTOs (P13-22b) - mirror the "Frontend DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-12-tutor-packages.md` section 10 (purchase, my packages, credit booking). If a C# record
 * disagrees with a type here, the C# record wins: report it, do not guess.
 *
 * A package purchase is money paid in advance for N lessons ("credits"). The server decides everything about it: the price
 * (`priceSnapshot`, fixed when the purchase was made), whether it is payable (`requiresPayment`), how many credits are left
 * (`creditsRemaining`), when it expires, and whether a credit can be booked right now. The client shows these values; it never
 * works out a count, a date or a price, and the "book with a credit" button is only a way to ask - the server answers 409 when it is not possible.
 */
import type { BookingOfferingSummary, Guid, IsoUtc } from './tutoring-learner.models';

export type { Guid, IsoUtc };

export type PackagePurchaseStatus = 'PendingPayment' | 'Active' | 'Exhausted' | 'Expired' | 'Cancelled';
export type PackageCreditStatus = 'Available' | 'Reserved' | 'Consumed' | 'Expired' | 'Refunded';

export interface PackageTutorRef {
  readonly slug: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
}

export interface PackageLearnerRef {
  readonly learnerProfileId: Guid;
  readonly nickname: string;
}

/** Body of `POST packages/{packageId}/purchase`. No price, tutor or user id: the server derives all of them. */
export interface PurchasePackageRequest {
  readonly learnerProfileId: Guid;
}

/**
 * `POST packages/{id}/purchase` (201, or 200 when the same pending purchase is handed back), `GET packages/my` rows.
 * `pendingExpiresAtUtc` is the payment deadline of a `PendingPayment` purchase; `expiresAtUtc` is when the credits stop being usable
 * (set once paid). `expiredPendingSettlement` = the credits ran out of time but the team has not closed the account yet: show it as expired.
 */
export interface PackagePurchaseSummary {
  readonly purchaseId: Guid;
  readonly packageId: Guid;
  readonly tutor: PackageTutorRef;
  readonly learner: PackageLearnerRef;
  readonly offering: BookingOfferingSummary;
  readonly status: PackagePurchaseStatus;
  readonly durationMinutes: number;
  readonly sessionsTotal: number;
  readonly sessionsUsed: number;
  readonly creditsRemaining: number;
  readonly validDays: number;
  readonly discountPercent: number;
  readonly priceSnapshot: number;
  readonly currency: 'THB';
  readonly pendingExpiresAtUtc: IsoUtc | null;
  readonly activatedAtUtc: IsoUtc | null;
  readonly expiresAtUtc: IsoUtc | null;
  readonly paymentId: Guid | null;
  readonly requiresPayment: boolean;
  readonly expiredPendingSettlement: boolean;
  readonly serverTimeUtc: IsoUtc;
}

/** One credit of a purchase. `bookingId` / `sessionStartsAtUtc` are set while a lesson holds the credit (or used it). */
export interface PackageCreditDto {
  readonly seqNo: number;
  readonly status: PackageCreditStatus;
  readonly bookingId: Guid | null;
  readonly sessionStartsAtUtc: IsoUtc | null;
}

/** `GET package-purchases/{purchaseId}`: the summary plus every credit, owner only. */
export interface PackagePurchaseDetail extends PackagePurchaseSummary {
  readonly credits: readonly PackageCreditDto[];
}

/** Body of `POST package-purchases/{purchaseId}/bookings`. Offering, length, learner and price all come from the purchase on the server. */
export interface BookWithPackageRequest {
  readonly startsAtUtc: IsoUtc;
}

/** `GET packages/my` query; `status` is optional (all purchases, newest first as the server orders them). */
export interface MyPackagesQuery {
  readonly status?: PackagePurchaseStatus | readonly PackagePurchaseStatus[] | string;
  readonly page: number;
  readonly pageSize: number;
}
