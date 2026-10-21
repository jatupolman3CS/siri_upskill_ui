import type { StatusView } from '../../live/data/live-instructor.util';
import type { BookingStage } from './tutoring-checkout.util';
import { packageCreditStatusLabelKey, packageStatusLabelKey } from './tutoring-labels';
import type { PackageCreditStatus, PackagePurchaseStatus, PackagePurchaseSummary } from './tutoring-package-purchase.models';

/**
 * Pure helpers of the learner's package screens. None of them decides anything the server owns (price, credits left, expiry, whether a
 * lesson can be booked): they pick wording, icons and routes for answers the server already gave.
 */

export const PACKAGE_PURCHASE_STATUSES: readonly PackagePurchaseStatus[] = ['PendingPayment', 'Active', 'Exhausted', 'Expired', 'Cancelled'];
export const PACKAGE_CREDIT_STATUSES: readonly PackageCreditStatus[] = ['Available', 'Reserved', 'Consumed', 'Expired', 'Refunded'];

/** i18n key of the wording for a paid purchase whose credits have run out of time but whose account the team has not closed yet. */
export const PACKAGE_EXPIRED_REVIEW_KEY = 'tutoring.enums.packageStatus.ExpiredReview';

/** `?status=` as a purchase status, or `null` (a hand-edited URL never reaches the API as an unknown value). */
export function parsePackageStatus(raw: string | null): PackagePurchaseStatus | null {
  return PACKAGE_PURCHASE_STATUSES.find((status) => status === raw) ?? null;
}

/**
 * Where a purchase stands as far as the checkout page is concerned (the same four stages as a booking):
 * `payable` - waiting for payment; `confirmed` - paid and usable (`Active`, or `Exhausted` = every credit already booked);
 * `ended` - it was cancelled, so nothing is left to pay; `finalized` - it is paid but its credits are past their expiry.
 */
export function packageStageOf(status: PackagePurchaseStatus): BookingStage {
  switch (status) {
    case 'PendingPayment':
      return 'payable';
    case 'Active':
    case 'Exhausted':
      return 'confirmed';
    case 'Cancelled':
      return 'ended';
    case 'Expired':
      return 'finalized';
  }
}

/** A purchase status as a chip: label + icon + tone, never colour alone. Icons are registered by `StatusChip`. */
export function packageStatusView(purchase: Pick<PackagePurchaseSummary, 'status' | 'expiredPendingSettlement'>): StatusView {
  if (purchase.expiredPendingSettlement) {
    return { labelKey: PACKAGE_EXPIRED_REVIEW_KEY, icon: 'phosphorHourglass', tone: 'warning' };
  }
  const labelKey = packageStatusLabelKey(purchase.status);
  switch (purchase.status) {
    case 'PendingPayment':
      return { labelKey, icon: 'phosphorHourglass', tone: 'warning' };
    case 'Active':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'success' };
    case 'Exhausted':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'info' };
    default:
      return { labelKey, icon: 'phosphorProhibit', tone: 'neutral' };
  }
}

/** A credit status as a chip. */
export function creditStatusView(status: PackageCreditStatus): StatusView {
  const labelKey = packageCreditStatusLabelKey(status);
  switch (status) {
    case 'Available':
      return { labelKey, icon: 'phosphorCircleDashed', tone: 'success' };
    case 'Reserved':
      return { labelKey, icon: 'phosphorCalendarBlank', tone: 'info' };
    case 'Consumed':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'neutral' };
    case 'Refunded':
      return { labelKey, icon: 'phosphorXCircle', tone: 'neutral' };
    case 'Expired':
      return { labelKey, icon: 'phosphorProhibit', tone: 'neutral' };
  }
}

/**
 * Whether to OFFER the "book a lesson with a credit" action: the server says the purchase is `Active`, has credits left and is not
 * waiting for the team to close it. Only a display gate - the server re-checks everything (credit, expiry, tutor, slot) when the
 * booking is made and answers 409 with the reason.
 */
export function canOfferCreditBooking(purchase: Pick<PackagePurchaseSummary, 'status' | 'creditsRemaining' | 'expiredPendingSettlement'>): boolean {
  return purchase.status === 'Active' && purchase.creditsRemaining > 0 && !purchase.expiredPendingSettlement;
}

/** Route of the page that pays for a purchase. */
export function packageCheckoutRoute(purchaseId: string): readonly string[] {
  return ['/tutoring', 'checkout', 'package', purchaseId];
}

/** Route of one purchase (its credits and the booking calendar). */
export function packagePurchaseRoute(purchaseId: string): readonly string[] {
  return ['/my-tutoring', 'packages', purchaseId];
}
