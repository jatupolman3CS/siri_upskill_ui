import type {
  AnalyticsOverview,
  FunnelReport,
  KycAgingReport,
  RetentionCohort,
  RetentionReport,
  RevenueBucket,
  RevenueReport,
  SearchDemandReport,
  TopTutorRow,
  TopTutorsReport,
} from '../data/admin-analytics.models';

/** Fixtures of the administrator analytics specs. Plain data; each factory takes overrides. The figures are arbitrary but consistent. */

export function revenueBucket(overrides: Partial<RevenueBucket> = {}): RevenueBucket {
  return {
    bucketStart: '2026-10-12',
    paymentCount: 4,
    grossCollectedAmount: 1800,
    refundCount: 1,
    refundedAmount: 450,
    netCollectedAmount: 1350,
    ledgerEntryCount: 3,
    recognisedGrossAmount: 1350,
    paymentFeeAmount: 54,
    platformCommissionAmount: 259.2,
    tutorPayableAmount: 1036.8,
    ...overrides,
  };
}

export function revenueReport(overrides: Partial<RevenueReport> = {}): RevenueReport {
  return {
    generatedAtUtc: '2026-10-14T03:00:00Z',
    effectiveFrom: '2026-10-12',
    effectiveTo: '2026-10-13',
    currency: 'THB',
    granularity: 'Day',
    buckets: [
      revenueBucket(),
      revenueBucket({
        bucketStart: '2026-10-13',
        paymentCount: 2,
        grossCollectedAmount: 900,
        refundCount: 3,
        refundedAmount: 1350,
        netCollectedAmount: -450,
        ledgerEntryCount: 2,
        recognisedGrossAmount: 900,
        paymentFeeAmount: 36,
        platformCommissionAmount: 172.8,
        tutorPayableAmount: 691.2,
      }),
    ],
    totals: {
      paymentCount: 6,
      grossCollectedAmount: 2700,
      refundCount: 4,
      refundedAmount: 1800,
      netCollectedAmount: 900,
      ledgerEntryCount: 5,
      recognisedGrossAmount: 2250,
      paymentFeeAmount: 90,
      platformCommissionAmount: 432,
      tutorPayableAmount: 1728,
    },
    ledgerMismatch: false,
    notes: ['package_timing', 'fee_may_be_estimate'],
    ...overrides,
  };
}

export function searchDemandReport(overrides: Partial<SearchDemandReport> = {}): SearchDemandReport {
  return {
    generatedAtUtc: '2026-10-14T03:00:00Z',
    effectiveFrom: '2026-09-15',
    effectiveTo: '2026-10-14',
    totalSearches: 340,
    totalZeroResult: 41,
    suppressedSearchCount: 12,
    minGroupCount: 5,
    topSubjects: [
      { subjectId: 's-1', slug: 'physics', nameTh: 'Physics (TH)', nameEn: 'Physics', isGroup: false, searchCount: 120, zeroResultCount: 6, zeroResultRate: 0.05 },
      { subjectId: 's-2', slug: 'math', nameTh: 'Mathematics (TH)', nameEn: 'Mathematics', isGroup: true, searchCount: 60, zeroResultCount: 30, zeroResultRate: 0.5 },
    ],
    topQueries: [{ queryText: 'gat english <b>online</b>', searchCount: 14 }],
    ...overrides,
  };
}

export function retentionCohort(overrides: Partial<RetentionCohort> = {}): RetentionCohort {
  return {
    cohortMonth: '2026-08',
    cohortSize: 20,
    eligible30: 20,
    retained30: 9,
    rate30: 0.45,
    eligible60: 20,
    retained60: 12,
    rate60: 0.6,
    retainedPaid30: 7,
    ratePaid30: 0.35,
    retainedPaid60: 10,
    ratePaid60: 0.5,
    ...overrides,
  };
}

export function retentionReport(overrides: Partial<RetentionReport> = {}): RetentionReport {
  return {
    generatedAtUtc: '2026-10-14T03:00:00Z',
    fromMonth: '2026-07',
    toMonth: '2026-10',
    minCohortSize: 5,
    cohorts: [
      retentionCohort({ cohortMonth: '2026-07' }),
      retentionCohort({ cohortMonth: '2026-08', cohortSize: 3, eligible30: 3, retained30: 1, rate30: null, eligible60: 3, retained60: 1, rate60: null, retainedPaid30: 1, ratePaid30: null, retainedPaid60: 1, ratePaid60: null }),
    ],
    overall: {
      cohortSize: 23,
      eligible30: 23,
      retained30: 10,
      rate30: 0.4348,
      eligible60: 23,
      retained60: 13,
      rate60: 0.5652,
      retainedPaid30: 8,
      ratePaid30: 0.3478,
      retainedPaid60: 11,
      ratePaid60: 0.4783,
    },
    ...overrides,
  };
}

export function funnelReport(overrides: Partial<FunnelReport> = {}): FunnelReport {
  return {
    generatedAtUtc: '2026-10-14T03:00:00Z',
    effectiveFrom: '2026-09-15',
    effectiveTo: '2026-10-14',
    segment: 'All',
    counts: {
      created: 100,
      stillPending: 4,
      expired: 20,
      abandonedByLearner: 6,
      everConfirmed: 70,
      stillConfirmed: 10,
      settled: 60,
      completed: 50,
      noShowLearner: 3,
      noShowTutor: 2,
      noShowBoth: 0,
      cancelledByLearnerAfterConfirm: 4,
      cancelledByTutorAfterConfirm: 1,
      inDispute: 1,
      withDispute: 2,
    },
    rates: [
      { key: 'holdConversionRate', numerator: 70, denominator: 96, value: 0.7292 },
      { key: 'completionRate', numerator: 50, denominator: 60, value: 0.8333 },
      { key: 'noShowBothRate', numerator: 0, denominator: 0, value: null },
      { key: 'someFutureRate', numerator: 1, denominator: 2, value: 0.5 },
    ],
    ...overrides,
  };
}

export function topTutorRow(overrides: Partial<TopTutorRow> = {}): TopTutorRow {
  return {
    tutorId: 'tutor-1',
    slug: 'nina-tutor',
    displayName: 'Nina Tutor',
    status: 'Verified',
    completedBookings: 18,
    completedSessions: 16,
    bookedGrossAmount: 8100,
    ratingAverage: 4.75,
    ratingCount: 12,
    reliabilityScore: 98.5,
    penaltyPoints: 0,
    disputesAgainst: 1,
    ...overrides,
  };
}

export function topTutorsReport(overrides: Partial<TopTutorsReport> = {}): TopTutorsReport {
  return {
    generatedAtUtc: '2026-10-14T03:00:00Z',
    effectiveFrom: '2026-09-15',
    effectiveTo: '2026-10-14',
    sort: 'Completed',
    tutors: [topTutorRow(), topTutorRow({ tutorId: 'tutor-2', slug: 'kan-tutor', displayName: 'Kan Tutor', status: 'Suspended', completedBookings: 9, completedSessions: 9, bookedGrossAmount: 3600, penaltyPoints: 4 })],
    ...overrides,
  };
}

export function kycAgingReport(overrides: Partial<KycAgingReport> = {}): KycAgingReport {
  return {
    generatedAtUtc: '2026-10-14T03:00:00Z',
    byStatus: { submitted: 3, inReview: 2, needsInfo: 4 },
    awaitingAdmin: 5,
    awaitingTutor: 4,
    ageBuckets: { lt24h: 2, h24to48: 1, h48to72: 1, gt72h: 1 },
    oldestAwaitingAdminSubmittedAtUtc: '2026-10-10T03:00:00Z',
    oldestAwaitingAdminAgeHours: 96,
    decided30d: { approved: 14, rejected: 2, needsInfo: 5 },
    medianHoursToDecision30d: 20.5,
    p90HoursToDecision30d: 60,
    ...overrides,
  };
}

export function analyticsOverview(overrides: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    generatedAtUtc: '2026-10-14T03:00:00Z',
    last30Days: { cashNetAmount: 12500, platformCommissionAmount: 2400, completedBookings: 52, holdConversionRate: 0.7292, completionRate: 0.8333 },
    latestMatureRetention: { cohortMonth: '2026-08', rate60: 0.6 },
    kycAwaitingAdmin: 5,
    kycOldestAgeHours: 96,
    disputes: { open: 3, overdue: 1, highPriority: 2 },
    topSearchedSubject: { nameTh: 'Physics (TH)', searchCount: 120 },
    ...overrides,
  };
}
