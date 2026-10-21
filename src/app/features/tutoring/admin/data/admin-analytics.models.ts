/**
 * Administrator analytics of the tutor marketplace (P13-27). Mirrors, field for field, the "Frontend notes + DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-15-admin-analytics.md` (section 11). At the time of writing there is NO C# for these endpoints
 * (the contract is FROZEN, the code is not built), so this file is the contract's shape and nothing else. When the controller lands, diff it
 * against these types; if a C# record disagrees, the C# record wins: report it.
 *
 * Every figure is the server's. The client never adds, subtracts, averages or rounds one: it lays the numbers out (and draws a bar whose
 * length is a share of the largest value on screen - decoration, the number is always written next to it). Two groups in the revenue report
 * - cash that moved and revenue recognised in the ledger - are different measurements and are never combined here.
 * No report contains anything about a learner, a guardian or a child: only counts, totals and the public name of a tutor.
 */
import type { Guid, IsoUtc } from '../../data/tutoring-public.models';

export type { Guid, IsoUtc };

/** `yyyy-MM-dd`, a calendar day in Thailand (UTC+7). */
export type LocalDate = string;

export type AnalyticsGranularity = 'Day' | 'Week' | 'Month';
export type FunnelSegment = 'All' | 'Trial' | 'Paid';
export type TopTutorSort = 'Completed' | 'Booked' | 'Rating';

/** The range the server actually used (it aligns week / month ranges to whole buckets and clamps a search range to its retention). */
export interface AnalyticsMeta {
  readonly generatedAtUtc: IsoUtc;
  readonly effectiveFrom: LocalDate;
  readonly effectiveTo: LocalDate;
}

// --- Revenue (section 4.1) -----------------------------------------------------------------------------------------------------

export interface RevenueBucket {
  /** First day of the bucket (a day, an ISO Monday or the 1st of a month), Thailand time. */
  readonly bucketStart: LocalDate;
  // Cash that moved (PAYMENTS succeeded / REFUNDS completed), bucketed by the time it moved.
  readonly paymentCount: number;
  readonly grossCollectedAmount: number;
  readonly refundCount: number;
  readonly refundedAmount: number;
  readonly netCollectedAmount: number;
  // Revenue the platform's ledger recognised (after refunds), bucketed by ledger time.
  readonly ledgerEntryCount: number;
  readonly recognisedGrossAmount: number;
  readonly paymentFeeAmount: number;
  readonly platformCommissionAmount: number;
  readonly tutorPayableAmount: number;
}

export type RevenueTotals = Omit<RevenueBucket, 'bucketStart'>;

/** Fixed codes for the explanations a report carries; FE words them. An unknown code is dropped, never shown raw. */
export type RevenueNote = 'package_timing' | 'ledger_excludes_fully_refunded_before_batch' | 'fee_may_be_estimate' | 'cash_vs_ledger_not_comparable_per_bucket';

export interface RevenueReport extends AnalyticsMeta {
  readonly currency: 'THB';
  readonly granularity: AnalyticsGranularity;
  readonly buckets: readonly RevenueBucket[];
  readonly totals: RevenueTotals;
  /** The server cross-checked its ledger totals against the payout totals and they did not agree (non-production only). */
  readonly ledgerMismatch: boolean;
  readonly notes: readonly string[];
}

// --- Search demand (section 4.2) -----------------------------------------------------------------------------------------------

export interface SearchSubjectDemand {
  readonly subjectId: Guid;
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly isGroup: boolean;
  readonly searchCount: number;
  readonly zeroResultCount: number;
  /** `zeroResultCount / searchCount`, 0..1. */
  readonly zeroResultRate: number;
}

export interface SearchQueryDemand {
  readonly queryText: string;
  readonly searchCount: number;
}

/**
 * Groups with fewer than `minGroupCount` searches are not listed (privacy); their searches are counted together in
 * `suppressedSearchCount`. Query texts below the server's own threshold are not listed either.
 */
export interface SearchDemandReport extends AnalyticsMeta {
  readonly totalSearches: number;
  readonly totalZeroResult: number;
  readonly suppressedSearchCount: number;
  readonly minGroupCount: number;
  readonly topSubjects: readonly SearchSubjectDemand[];
  readonly topQueries: readonly SearchQueryDemand[];
}

// --- Retention (section 4.3) ---------------------------------------------------------------------------------------------------

/** A rate is `null` when the cohort is smaller than `minCohortSize`: "not enough data", never a zero. */
export interface RetentionCohort {
  /** `yyyy-MM`, Thailand time. */
  readonly cohortMonth: string;
  readonly cohortSize: number;
  readonly eligible30: number;
  readonly retained30: number;
  readonly rate30: number | null;
  readonly eligible60: number;
  readonly retained60: number;
  readonly rate60: number | null;
  readonly retainedPaid30: number;
  readonly ratePaid30: number | null;
  readonly retainedPaid60: number;
  readonly ratePaid60: number | null;
}

export type RetentionOverall = Omit<RetentionCohort, 'cohortMonth'>;

export interface RetentionReport {
  readonly generatedAtUtc: IsoUtc;
  readonly fromMonth: string;
  readonly toMonth: string;
  readonly minCohortSize: number;
  readonly cohorts: readonly RetentionCohort[];
  readonly overall: RetentionOverall;
}

// --- Booking funnel (section 4.4) ----------------------------------------------------------------------------------------------

export interface FunnelCounts {
  readonly created: number;
  readonly stillPending: number;
  readonly expired: number;
  readonly abandonedByLearner: number;
  readonly everConfirmed: number;
  readonly stillConfirmed: number;
  readonly settled: number;
  readonly completed: number;
  readonly noShowLearner: number;
  readonly noShowTutor: number;
  readonly noShowBoth: number;
  readonly cancelledByLearnerAfterConfirm: number;
  readonly cancelledByTutorAfterConfirm: number;
  readonly inDispute: number;
  readonly withDispute: number;
}

/** `value` is `null` when `denominator` is 0. The denominator is part of the answer so a screen can show what the rate is out of. */
export interface FunnelRate {
  readonly key: string;
  readonly numerator: number;
  readonly denominator: number;
  readonly value: number | null;
}

export interface FunnelReport extends AnalyticsMeta {
  readonly segment: FunnelSegment;
  readonly counts: FunnelCounts;
  readonly rates: readonly FunnelRate[];
}

// --- Top tutors (section 4.5) --------------------------------------------------------------------------------------------------

export interface TopTutorRow {
  readonly tutorId: Guid;
  readonly slug: string;
  readonly displayName: string;
  readonly status: string;
  readonly completedBookings: number;
  readonly completedSessions: number;
  /** The price of the completed bookings BEFORE commission and refunds - it is not what the tutor earned. */
  readonly bookedGrossAmount: number;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly reliabilityScore: number;
  readonly penaltyPoints: number;
  readonly disputesAgainst: number;
}

export interface TopTutorsReport extends AnalyticsMeta {
  readonly sort: TopTutorSort;
  readonly tutors: readonly TopTutorRow[];
}

// --- KYC aging (section 4.6) and overview (section 4.7) ------------------------------------------------------------------------

export interface KycAgingReport {
  readonly generatedAtUtc: IsoUtc;
  readonly byStatus: { readonly submitted: number; readonly inReview: number; readonly needsInfo: number };
  readonly awaitingAdmin: number;
  readonly awaitingTutor: number;
  readonly ageBuckets: { readonly lt24h: number; readonly h24to48: number; readonly h48to72: number; readonly gt72h: number };
  readonly oldestAwaitingAdminSubmittedAtUtc: IsoUtc | null;
  readonly oldestAwaitingAdminAgeHours: number | null;
  readonly decided30d: { readonly approved: number; readonly rejected: number; readonly needsInfo: number };
  readonly medianHoursToDecision30d: number | null;
  readonly p90HoursToDecision30d: number | null;
}

export interface AnalyticsOverview {
  readonly generatedAtUtc: IsoUtc;
  readonly last30Days: {
    readonly cashNetAmount: number;
    readonly platformCommissionAmount: number;
    readonly completedBookings: number;
    readonly holdConversionRate: number | null;
    readonly completionRate: number | null;
  };
  readonly latestMatureRetention: { readonly cohortMonth: string; readonly rate60: number | null } | null;
  readonly kycAwaitingAdmin: number;
  readonly kycOldestAgeHours: number | null;
  readonly disputes: { readonly open: number; readonly overdue: number; readonly highPriority: number };
  readonly topSearchedSubject: { readonly nameTh: string; readonly searchCount: number } | null;
}

// --- Queries ------------------------------------------------------------------------------------------------------------------

export interface RevenueQuery {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly granularity: AnalyticsGranularity;
}

export interface SearchDemandQuery {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly top: number;
}

export interface RetentionQuery {
  readonly fromMonth: string;
  readonly toMonth: string;
}

export interface FunnelQuery {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly segment: FunnelSegment;
}

export interface TopTutorsQuery {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly sort: TopTutorSort;
  readonly top: number;
}
