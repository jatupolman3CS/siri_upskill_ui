import { creditStatusView, canOfferCreditBooking, packageCheckoutRoute, packagePurchaseRoute, packageStageOf, packageStatusView, parsePackageStatus } from './tutoring-package.util';
import { PACKAGE_CREDIT_STATUSES, PACKAGE_EXPIRED_REVIEW_KEY, PACKAGE_PURCHASE_STATUSES } from './tutoring-package.util';
import type { PackagePurchaseStatus } from './tutoring-package-purchase.models';

describe('parsePackageStatus', () => {
  it('accepts the five statuses and nothing else, so a hand-edited URL never reaches the API as an unknown value', () => {
    for (const status of PACKAGE_PURCHASE_STATUSES) {
      expect(parsePackageStatus(status)).toBe(status);
    }
    expect(parsePackageStatus('active')).toBeNull();
    expect(parsePackageStatus('Paid')).toBeNull();
    expect(parsePackageStatus('')).toBeNull();
    expect(parsePackageStatus(null)).toBeNull();
  });
});

describe('packageStageOf', () => {
  it.each([
    ['PendingPayment', 'payable'],
    ['Active', 'confirmed'],
    ['Exhausted', 'confirmed'],
    ['Cancelled', 'ended'],
    ['Expired', 'finalized'],
  ] as readonly (readonly [PackagePurchaseStatus, string])[])('puts %s in the %s stage', (status, stage) => {
    expect(packageStageOf(status)).toBe(stage);
  });
});

describe('packageStatusView', () => {
  it('shows a label and an icon for every status - meaning never rests on colour alone', () => {
    for (const status of PACKAGE_PURCHASE_STATUSES) {
      const view = packageStatusView({ status, expiredPendingSettlement: false });
      expect(view.labelKey).toBe(`tutoring.enums.packageStatus.${status}`);
      expect(view.icon).toMatch(/^phosphor/);
    }
  });

  it('reads a purchase that ran out of time but is not yet closed as "being reviewed", whatever its status says', () => {
    const view = packageStatusView({ status: 'Active', expiredPendingSettlement: true });

    expect(view.labelKey).toBe(PACKAGE_EXPIRED_REVIEW_KEY);
    expect(view.tone).toBe('warning');
  });

  it('tones an unpaid purchase as a warning and a usable one as a success', () => {
    expect(packageStatusView({ status: 'PendingPayment', expiredPendingSettlement: false }).tone).toBe('warning');
    expect(packageStatusView({ status: 'Active', expiredPendingSettlement: false }).tone).toBe('success');
    expect(packageStatusView({ status: 'Cancelled', expiredPendingSettlement: false }).tone).toBe('neutral');
  });
});

describe('creditStatusView', () => {
  it('has a label and an icon for every credit status', () => {
    for (const status of PACKAGE_CREDIT_STATUSES) {
      const view = creditStatusView(status);
      expect(view.labelKey).toBe(`tutoring.enums.packageCreditStatus.${status}`);
      expect(view.icon).toMatch(/^phosphor/);
    }
  });
});

describe('canOfferCreditBooking', () => {
  const base = { status: 'Active', creditsRemaining: 3, expiredPendingSettlement: false } as const;

  it('offers booking only for an active purchase that still has credits and is not waiting to be closed', () => {
    expect(canOfferCreditBooking(base)).toBe(true);
    expect(canOfferCreditBooking({ ...base, creditsRemaining: 0 })).toBe(false);
    expect(canOfferCreditBooking({ ...base, expiredPendingSettlement: true })).toBe(false);
    for (const status of ['PendingPayment', 'Exhausted', 'Expired', 'Cancelled'] as const) {
      expect(canOfferCreditBooking({ ...base, status })).toBe(false);
    }
  });
});

describe('package routes', () => {
  it('points at the package checkout and at one purchase', () => {
    expect(packageCheckoutRoute('pp-1')).toEqual(['/tutoring', 'checkout', 'package', 'pp-1']);
    expect(packagePurchaseRoute('pp-1')).toEqual(['/my-tutoring', 'packages', 'pp-1']);
  });
});
