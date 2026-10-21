/**
 * Test fixtures of the learner-side specs (learner profiles, booking, checkout): well-formed API payloads that individual
 * tests override. Not used by the app.
 */
import type { PagedResult } from '../../../../core/http/paged-result.model';
import type { Booking, LearnerProfile } from '../../data/tutoring-learner.models';
import type { TutoringPayment, TutoringPaymentState } from '../../data/tutoring-payment.models';
import type { TutorPublicProfile, TutorSlotsResponse } from '../../data/tutoring-public.models';

export function pagedOf<T>(items: readonly T[]): PagedResult<T> {
  return { items, totalCount: items.length, page: 1, pageSize: 50, totalPages: 1 };
}

export function learnerProfile(overrides: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    learnerProfileId: 'lp-1',
    nickname: 'Mint',
    gradeLevel: 'Secondary4',
    isMinor: true,
    guardianConsentAtUtc: '2026-10-10T03:00:00Z',
    guardianConsentVersion: '2026-10-v1',
    isActive: true,
    ...overrides,
  };
}

/** A booking that is waiting for payment, 15 minutes of hold left on the server clock. */
export function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    bookingId: 'b-1',
    sessionId: '0198a000-0000-7000-8000-000000000001',
    bookingNo: 'TB-261014-A1B2C3',
    status: 'PendingPayment',
    isTrial: false,
    format: 'OneOnOne',
    priceAmount: 450,
    currency: 'THB',
    startsAtUtc: '2026-10-20T11:00:00Z',
    endsAtUtc: '2026-10-20T12:00:00Z',
    durationMinutes: 60,
    tutor: { slug: 'nina-tutor', displayName: 'Nina Tutor', photoUrl: null },
    offering: { offeringId: 'off-physics', subjectNameTh: 'Physics (TH)', subjectNameEn: 'Physics', level: 'UpperSecondary', curriculum: 'Thai' },
    learner: { learnerProfileId: 'lp-1', nickname: 'Mint', gradeLevel: 'Secondary4' },
    holdExpiresAtUtc: '2026-10-14T03:15:00Z',
    requiresPayment: true,
    paymentId: null,
    refundedAmount: 0,
    confirmedAtUtc: null,
    createdAtUtc: '2026-10-14T03:00:00Z',
    serverTimeUtc: '2026-10-14T03:00:00Z',
    packagePurchaseId: null,
    joinOpensAtUtc: null,
    canJoin: false,
    ...overrides,
  };
}

export function confirmedBooking(overrides: Partial<Booking> = {}): Booking {
  return booking({
    status: 'Confirmed',
    requiresPayment: false,
    holdExpiresAtUtc: null,
    confirmedAtUtc: '2026-10-14T03:05:00Z',
    joinOpensAtUtc: '2026-10-20T10:45:00Z',
    ...overrides,
  });
}

export function qrPayment(overrides: Partial<TutoringPayment> = {}): TutoringPayment {
  return {
    paymentId: 'pay-1',
    kind: 'Booking',
    referenceId: 'b-1',
    attemptNo: 1,
    method: 'PromptPay',
    amount: 450,
    currency: 'THB',
    status: 'Pending',
    holdExpiresAtUtc: '2026-10-14T03:15:00Z',
    clientSecret: null,
    qrCodeUrl: 'https://qr.example.test/pay-1.png',
    qrCodeData: '000201010212',
    createdAtUtc: '2026-10-14T03:01:00Z',
    ...overrides,
  };
}

export function cardPayment(overrides: Partial<TutoringPayment> = {}): TutoringPayment {
  return qrPayment({ method: 'Card', clientSecret: 'pi_secret_1', qrCodeUrl: null, qrCodeData: null, ...overrides });
}

export function paymentState(overrides: Partial<TutoringPaymentState> = {}): TutoringPaymentState {
  return {
    paymentId: 'pay-1',
    kind: 'Booking',
    referenceId: 'b-1',
    status: 'Pending',
    method: 'PromptPay',
    amount: 450,
    refundedCompletedAmount: 0,
    refundPendingAmount: 0,
    lateResolution: 'None',
    bookingStatus: null,
    updatedAtUtc: '2026-10-14T03:01:00Z',
    ...overrides,
  };
}

export function publicTutor(overrides: Partial<TutorPublicProfile> = {}): TutorPublicProfile {
  return {
    slug: 'nina-tutor',
    displayName: 'Nina Tutor',
    headline: 'Physics for upper secondary',
    bio: 'I have taught physics for six years.',
    photoUrl: null,
    introVideo: null,
    gender: 'Female',
    yearsExperience: 6,
    ratingAverage: 4.7,
    ratingCount: 21,
    completedSessionsCount: 140,
    verified: true,
    verifiedAtUtc: '2026-03-01T00:00:00Z',
    minNoticeHours: 24,
    maxAdvanceDays: 30,
    nextAvailableAtUtc: '2026-10-15T02:00:00Z',
    timezone: 'Asia/Bangkok',
    allowedDurationMinutes: [30, 60, 90, 120],
    offerings: [
      {
        offeringId: 'off-physics',
        subject: { slug: 'physics', nameTh: 'Physics (TH)', nameEn: 'Physics' },
        level: 'UpperSecondary',
        curriculum: 'Thai',
        hourlyRateOneOnOne: 450,
        groupHourlyRatePerSeat: 250,
        groupMaxSeats: 4,
        trial: { minutes: 30, price: 0, isFree: true },
      },
      {
        offeringId: 'off-math',
        subject: { slug: 'math', nameTh: 'Mathematics (TH)', nameEn: 'Mathematics' },
        level: 'Primary',
        curriculum: 'EP',
        hourlyRateOneOnOne: 300,
        groupHourlyRatePerSeat: null,
        groupMaxSeats: null,
        trial: null,
      },
    ],
    educations: [],
    certificates: [],
    ...overrides,
  };
}

/** A slots answer with the given start times (1h long each). */
export function slotsResponse(startsAtUtc: readonly string[], overrides: Partial<TutorSlotsResponse> = {}): TutorSlotsResponse {
  return {
    tutorSlug: 'nina-tutor',
    offeringId: 'off-physics',
    format: 'OneOnOne',
    durationMinutes: 60,
    isTrial: false,
    quote: { amount: 450, currency: 'THB', durationMinutes: 60, hourlyRate: 450, isFree: false },
    timezone: 'Asia/Bangkok',
    serverTimeUtc: '2026-10-14T03:00:00Z',
    fromUtc: '2026-10-13T17:00:00Z',
    toUtc: '2026-10-20T17:00:00Z',
    minNoticeHours: 24,
    maxAdvanceDays: 30,
    slots: startsAtUtc.map((start) => ({
      startsAtUtc: start,
      endsAtUtc: new Date(Date.parse(start) + 3_600_000).toISOString().replace('.000Z', 'Z'),
      seatsLeft: 1,
      joinsExistingGroup: false,
    })),
    ...overrides,
  };
}
