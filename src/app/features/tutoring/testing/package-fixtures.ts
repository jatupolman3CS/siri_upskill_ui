/**
 * Test fixtures of the package specs (public offer, learner purchase, credits): well-formed API payloads that individual tests override.
 * Not used by the app.
 */
import type { PackageCreditDto, PackagePurchaseDetail, PackagePurchaseSummary } from '../data/tutoring-package-purchase.models';
import type { PackageOffer } from '../data/tutoring-packages.models';

/** 10 lessons of 60 minutes with 10% off a 450 baht hour: the contract's own worked example (4,050.00). */
export function packageOffer(overrides: Partial<PackageOffer> = {}): PackageOffer {
  return {
    packageId: 'pkg-1',
    offering: { offeringId: 'off-physics', subjectNameTh: 'Physics (TH)', subjectNameEn: 'Physics', level: 'UpperSecondary', curriculum: 'Thai' },
    sessionCount: 10,
    durationMinutes: 60,
    discountPercent: 10,
    validDays: 90,
    singleSessionPrice: 450,
    totalPrice: 4050,
    pricePerSession: 405,
    savingsAmount: 450,
    currency: 'THB',
    ...overrides,
  };
}

/** A purchase that is waiting for payment. */
export function packagePurchase(overrides: Partial<PackagePurchaseSummary> = {}): PackagePurchaseSummary {
  return {
    purchaseId: 'pp-1',
    packageId: 'pkg-1',
    tutor: { slug: 'nina-tutor', displayName: 'Nina Tutor', photoUrl: null },
    learner: { learnerProfileId: 'lp-1', nickname: 'Mint' },
    offering: {
      offeringId: 'off-physics',
      subjectNameTh: 'Physics (TH)',
      subjectNameEn: 'Physics',
      level: 'UpperSecondary',
      curriculum: 'Thai',
    },
    status: 'PendingPayment',
    durationMinutes: 60,
    sessionsTotal: 10,
    sessionsUsed: 0,
    creditsRemaining: 10,
    validDays: 90,
    discountPercent: 10,
    priceSnapshot: 4050,
    currency: 'THB',
    pendingExpiresAtUtc: '2026-10-14T03:30:00Z',
    activatedAtUtc: null,
    expiresAtUtc: null,
    paymentId: null,
    requiresPayment: true,
    expiredPendingSettlement: false,
    serverTimeUtc: '2026-10-14T03:00:00Z',
    ...overrides,
  };
}

/** A paid purchase, 3 of 10 credits used, valid for 90 days from 2026-10-14. */
export function activePurchase(overrides: Partial<PackagePurchaseSummary> = {}): PackagePurchaseSummary {
  return packagePurchase({
    status: 'Active',
    sessionsUsed: 3,
    creditsRemaining: 7,
    pendingExpiresAtUtc: null,
    activatedAtUtc: '2026-10-14T03:05:00Z',
    expiresAtUtc: '2027-01-12T03:05:00Z',
    requiresPayment: false,
    ...overrides,
  });
}

export function packageCredits(): readonly PackageCreditDto[] {
  return [
    { seqNo: 1, status: 'Consumed', bookingId: 'b-1', sessionStartsAtUtc: '2026-10-16T11:00:00Z' },
    { seqNo: 2, status: 'Reserved', bookingId: 'b-2', sessionStartsAtUtc: '2026-10-23T11:00:00Z' },
    { seqNo: 3, status: 'Available', bookingId: null, sessionStartsAtUtc: null },
  ];
}

export function packageDetail(overrides: Partial<PackagePurchaseDetail> = {}): PackagePurchaseDetail {
  return { ...activePurchase(), credits: packageCredits(), ...overrides };
}
