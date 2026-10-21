/**
 * Test fixtures and HTTP helpers of the P13-25 specs (availability, classes, packages, wallet): well-formed API payloads that
 * individual tests override, and a small router for `HttpTestingController` so a page that fires several requests while it
 * settles can be served by URL instead of by call order. Not used by the app.
 */
import type { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { PagedResult } from '../../../../core/http/paged-result.model';
import type { TutorAvailability } from '../../data/tutoring-availability.models';
import type {
  RoomStatusDto,
  TutorAttendanceLearner,
  TutorAttendanceResponse,
  TutorCancellationQuote,
  TutorClassListItem,
} from '../../data/tutoring-classes.models';
import type { TutorPackage } from '../../data/tutoring-packages.models';
import type { TutorLedgerRow, TutorWalletResponse, TutoringPayoutHistoryItem } from '../../data/tutoring-wallet.models';

export function paged<T>(items: readonly T[], overrides: Partial<PagedResult<T>> = {}): PagedResult<T> {
  return { items, totalCount: items.length, page: 1, pageSize: 10, totalPages: 1, ...overrides };
}

export function availability(overrides: Partial<TutorAvailability> = {}): TutorAvailability {
  return {
    timezone: 'Asia/Bangkok',
    settings: { minNoticeHours: 24, bufferMinutes: 10, maxAdvanceDays: 60, rowVersion: 'AAAAAAAAB9E=' },
    rules: [{ dayOfWeek: 1, startLocal: '09:00', endLocal: '12:00' }],
    maxRules: 50,
    allowedDurationMinutes: [30, 60, 90, 120],
    allowedBufferMinutes: [0, 5, 10, 15, 20, 30, 45, 60],
    ...overrides,
  };
}

export function classLearner(overrides: Partial<TutorAttendanceLearner> = {}): TutorAttendanceLearner {
  return {
    bookingId: 'b-1',
    nickname: 'Nok',
    gradeLevel: 'Secondary4',
    isMinor: true,
    status: 'Confirmed',
    joinedAtUtc: null,
    attestedTutorPresentAtUtc: null,
    confirmedAtUtc: null,
    ...overrides,
  };
}

export function attendance(overrides: Partial<TutorAttendanceResponse> = {}): TutorAttendanceResponse {
  return {
    sessionId: 's-1',
    startsAtUtc: '2026-10-20T02:00:00Z',
    endsAtUtc: '2026-10-20T03:00:00Z',
    status: 'Scheduled',
    tutorJoinedAtUtc: null,
    tutorConfirmedAtUtc: null,
    finalizedAtUtc: null,
    learners: [classLearner()],
    ...overrides,
  };
}

export function classListItem(overrides: Partial<TutorClassListItem> = {}): TutorClassListItem {
  return {
    sessionId: 's-1',
    startsAtUtc: '2026-10-20T02:00:00Z',
    endsAtUtc: '2026-10-20T03:00:00Z',
    status: 'Scheduled',
    format: 'OneOnOne',
    isTrial: false,
    offering: { offeringId: 'off-1', subjectNameTh: 'Physics (TH)', subjectNameEn: 'Physics', level: 'UpperSecondary', curriculum: 'Thai' },
    learners: [{ bookingId: 'b-1', nickname: 'Nok', gradeLevel: 'Secondary4', isMinor: true, status: 'Confirmed' }],
    seatsTaken: null,
    capacity: null,
    startOpensAtUtc: '2026-10-20T01:45:00Z',
    canStart: false,
    completeOpensAtUtc: '2026-10-20T02:50:00Z',
    canComplete: false,
    learnerPresent: false,
    needsSummary: false,
    summaryEditableUntilUtc: null,
    room: { state: 'Ready', needsAction: 'None' },
    serverTimeUtc: '2026-10-19T03:00:00Z',
    ...overrides,
  };
}

export function roomStatus(overrides: Partial<RoomStatusDto> = {}): RoomStatusDto {
  return {
    state: 'Ready',
    needsAction: 'None',
    provider: 'GoogleMeet',
    hasMeetingLink: true,
    isUsable: true,
    lastSyncAtUtc: null,
    errorCode: null,
    ...overrides,
  };
}

export function cancellationQuote(overrides: Partial<TutorCancellationQuote> = {}): TutorCancellationQuote {
  return {
    sessionId: 's-1',
    canCancel: true,
    refusalReason: null,
    affectedBookings: 2,
    totalRefundAmount: 900,
    penaltyKind: 'LateCancel',
    penaltyPoints: 5,
    currentReliabilityScore: 92,
    projectedReliabilityScore: 87,
    willTriggerSuspension: false,
    startsAtUtc: '2026-10-20T02:00:00Z',
    ...overrides,
  };
}

export function tutorPackage(overrides: Partial<TutorPackage> = {}): TutorPackage {
  return {
    packageId: 'p-1',
    offering: { offeringId: 'off-1', subjectNameTh: 'Physics (TH)', subjectNameEn: 'Physics', level: 'UpperSecondary', curriculum: 'Thai' },
    sessionCount: 10,
    durationMinutes: 60,
    discountPercent: 10,
    validDays: 90,
    singleSessionPrice: 450,
    totalPrice: 4050,
    pricePerSession: 405,
    savingsAmount: 450,
    currency: 'THB',
    isActive: true,
    rowVersion: 'AAAAAAAAB9E=',
    ...overrides,
  };
}

export function wallet(overrides: Partial<TutorWalletResponse['summary']> = {}): TutorWalletResponse {
  return {
    summary: {
      heldAmount: 900,
      frozenAmount: 150,
      availableAmount: 1200,
      processingAmount: 300,
      paidAmount: 4500,
      withholdingTaxPercent: 3,
      estimatedNetAvailable: 1164,
      minimumPayoutAmount: 500,
      meetsMinimum: true,
      hasVerifiedPayoutAccount: true,
      nextPayoutAtUtc: '2026-10-19T03:00:00Z',
      currency: 'THB',
      ...overrides,
    },
    commissionPercent: 20,
    tutorSharePercent: 80,
    payoutCadence: 'Weekly',
  };
}

export function ledgerRow(overrides: Partial<TutorLedgerRow> = {}): TutorLedgerRow {
  return {
    entryId: 'e-1',
    bookingId: 'b-1',
    bookingNo: 'TB-1001',
    sessionStartsAtUtc: '2026-10-13T02:00:00Z',
    kind: 'Earning',
    grossAmount: 450,
    paymentFeeAmount: 16.4,
    platformAmount: 86.72,
    tutorAmount: 346.88,
    state: 'Held',
    availableAtUtc: '2026-10-15T03:00:00Z',
    createdAtUtc: '2026-10-13T04:00:00Z',
    sourceKind: 'Booking',
    ...overrides,
  };
}

export function payoutRow(overrides: Partial<TutoringPayoutHistoryItem> = {}): TutoringPayoutHistoryItem {
  return {
    batchItemId: 'pi-1',
    periodKey: '2026-W41',
    grossAmount: 2000,
    withholdingTaxPercent: 3,
    withholdingTaxAmount: 60,
    netAmount: 1940,
    status: 'Transferred',
    paidAtUtc: '2026-10-14T05:00:00Z',
    ...overrides,
  };
}

// --- HTTP routing ------------------------------------------------------------------------------------------------------------

export interface Route {
  /** Matched against the request URL without its query string. */
  readonly url: string;
  readonly method?: string;
  /** The body to answer. */
  readonly reply?: unknown;
  /** The body to answer, computed from the request (wins over `reply`). */
  readonly replyWith?: (request: TestRequest) => unknown;
  /** A non-2xx status makes the answer an error whose body is `reply`. */
  readonly status?: number;
}

/**
 * Answers every request that is pending right now from `routes` (first match wins; a route with a `method` only matches that
 * method) and returns them. A request nobody routed fails the test loudly instead of hanging it.
 */
export function respond(httpMock: HttpTestingController, routes: readonly Route[], seen: TestRequest[] = []): TestRequest[] {
  for (const request of httpMock.match(() => true)) {
    const route = routes.find((candidate) => request.request.url === candidate.url && (candidate.method === undefined || candidate.method === request.request.method));
    if (route === undefined) {
      throw new Error(`Unrouted request: ${request.request.method} ${request.request.urlWithParams}`);
    }
    const body = route.replyWith !== undefined ? route.replyWith(request) : route.reply;
    if (route.status !== undefined && route.status >= 400) {
      request.flush(body ?? {}, { status: route.status, statusText: 'Error' });
    } else {
      request.flush(body ?? null, route.status === 204 ? { status: 204, statusText: 'No Content' } : {});
    }
    seen.push(request);
  }
  return seen;
}

/** Lets effects, resources and change detection run, serving each wave of requests as it appears. */
export async function settleWith(fixture: { detectChanges(): void }, httpMock: HttpTestingController, routes: readonly Route[], passes = 6): Promise<TestRequest[]> {
  const seen: TestRequest[] = [];
  for (let pass = 0; pass < passes; pass++) {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    respond(httpMock, routes, seen);
    await Promise.resolve();
  }
  fixture.detectChanges();
  return seen;
}

