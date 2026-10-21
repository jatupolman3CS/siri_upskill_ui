import type { BrowserContext, Request, Route } from '@playwright/test';

import type { PagedResult } from '../src/app/core/http/paged-result.model';
import type { MeResponse, OAuthClientsResponse, RefreshResponse } from '../src/app/features/auth/data/auth-api.models';
import type { CategoryTreeNode } from '../src/app/features/catalog/data/category-api.models';
import type { WishlistCourseItemResponse } from '../src/app/features/catalog/data/course-api.models';
import type { InstructorProfileResponse } from '../src/app/features/instructor/data/instructor-profile-api.models';
import type { UserNotificationResponse } from '../src/app/features/notification/data/notification-api.models';
import type {
  AdminKycCaseDetail,
  AdminKycCaseListItem,
  DecideKycCaseRequest,
} from '../src/app/features/tutoring/admin/data/admin-kyc.models';
import type {
  AvailabilityException,
  AvailabilityRule,
  AvailabilitySettings,
  ReplaceRulesRequest,
  SettingsRequest,
  TutorAvailability,
} from '../src/app/features/tutoring/data/tutoring-availability.models';
import type { JoinTutoringSessionResponse, TutorClassListItem } from '../src/app/features/tutoring/data/tutoring-classes.models';
import type {
  Booking,
  BookingListItem,
  CancellationPolicy,
  CreateBookingRequest,
  LearnerProfile,
} from '../src/app/features/tutoring/data/tutoring-learner.models';
import type {
  PublicSubjectItem,
  TutorPublicProfile,
  TutorSearchItem,
  TutorSearchResponse,
  TutorSlot,
  TutorSlotsResponse,
} from '../src/app/features/tutoring/data/tutoring-public.models';
import type { TutorReviewsResponse } from '../src/app/features/tutoring/data/tutoring-review.models';
import type { TutorOffering, TutorProfile } from '../src/app/features/tutoring/data/tutoring-tutor.models';

/**
 * A stateful in-memory stand-in for the tutoring API, shared by the Playwright tutoring suite (`tutoring-marketplace.spec.ts`)
 * and the quality audit (`tools/tutoring-audit.audit.ts`). It exists so a browser test can drive the real pages with no backend.
 *
 * Rules that keep the suite able to FAIL (P13-31):
 * - Every body is typed against the app's own TypeScript models (`import type`, erased at run time; `tsc -p e2e/tsconfig.json`
 *   checks them) and each model was compared field by field with its C# record, so a field the real API does not send is not here.
 * - The answers come from STATE, and the state changes only when a request actually arrives: a booking exists because the page
 *   POSTed `/tutoring/bookings`, the tutor sees that class because the booking is in state, an approved KYC case is approved
 *   because the page POSTed the decision. Nothing is pre-baked "as if the user had clicked".
 * - A request with no handler is answered 501 AND remembered in {@link TutoringMockApi.unmocked}; the spec fails on it.
 * - Request bodies are validated like the C# commands (`CreateBookingRequest`, `DecideKycCaseRequest`, ...): a missing or
 *   wrongly named field is a 400, exactly as the real model binding would answer.
 *
 * Mutation self-check: `E2E_MUTATE=bookings|approve|join|rules` (comma separated) switches those handlers off - they then answer 501
 * and are recorded as unmocked - and the test that depends on each one must turn red. It is read only here and is unset in a normal run.
 */

export type SignedInAs = 'Learner' | 'Instructor' | 'Admin' | null;

export interface RecordedRequest {
  readonly method: string;
  /** Path below `/api` (for example `/tutoring/bookings`). */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
}

interface Reply {
  readonly status?: number;
  readonly body?: unknown;
}

type Handler = (request: RecordedRequest, match: RegExpMatchArray) => Reply;

interface MockRoute {
  readonly name: string;
  readonly method: string;
  readonly pattern: RegExp;
  readonly handle: Handler;
}

// --- Identity of the people in the story ------------------------------------------------------------------------------------

export const LEARNER_USER_ID = '0192e2b3-0000-7000-8000-000000000001';
export const TUTOR_USER_ID = '0192e2b3-0000-7000-8000-000000000002';
export const ADMIN_USER_ID = '0192e2b3-0000-7000-8000-000000000003';
export const TUTOR_ID = '0192e2b3-0001-7000-8000-000000000001';
export const TUTOR_SLUG = 'somchai-rungruangkit-seed';
export const OFFERING_ID = '0192e2b3-0002-7000-8000-000000000001';
export const LEARNER_PROFILE_MINOR_ID = '0192e2b3-0003-7000-8000-000000000001';
export const LEARNER_PROFILE_ADULT_ID = '0192e2b3-0003-7000-8000-000000000002';
export const KYC_CASE_ID = '0192e2b3-0008-7000-8000-000000000001';
export const KYC_DOCUMENT_ID = '0192e2b3-0009-7000-8000-000000000001';
export const MEET_URL = 'https://meet.google.com/abc-defg-hij';
const TUTOR_NAME = 'สมชาย รุ่งเรืองกิจ (Seed)';
const SUBJECT_ID = '01a137b5-700c-765e-9fb2-f627ad190a26';
const GROUP_SUBJECT_ID = '01a137b5-7000-75f6-9a88-851ffe0b4f23';

const HOUR_MS = 3_600_000;
const BANGKOK_OFFSET_MS = 7 * HOUR_MS;
const GRID_MINUTES = 30;
const JOIN_OPENS_BEFORE_START_MS = 15 * 60_000;

// --- Bangkok calendar helpers (Asia/Bangkok has no daylight saving: always UTC+7) ---------------------------------------------

/** Calendar date `yyyy-MM-dd` and weekday (0 = Sunday) in Bangkok of an instant. */
export function bangkokDay(ms: number): { readonly date: string; readonly dayOfWeek: number } {
  const shifted = new Date(ms + BANGKOK_OFFSET_MS);
  return { date: shifted.toISOString().slice(0, 10), dayOfWeek: shifted.getUTCDay() };
}

/** Bangkok calendar date `days` days after the Bangkok date of `ms`. */
export function bangkokDayPlus(ms: number, days: number): { readonly date: string; readonly dayOfWeek: number } {
  return bangkokDay(ms + days * 24 * HOUR_MS);
}

/** The instant (ms) of `HH:mm` on a Bangkok calendar date. */
export function bangkokInstant(date: string, hhmm: string): number {
  return Date.parse(`${date}T${hhmm}:00+07:00`);
}

const iso = (ms: number): string => new Date(ms).toISOString();

// --- Fixture data (every body below is typed against the app's models) -------------------------------------------------------

const SUBJECTS: readonly PublicSubjectItem[] = [
  { subjectId: GROUP_SUBJECT_ID, slug: 'math', nameTh: 'คณิตศาสตร์', nameEn: 'Mathematics', parentSlug: null, sortOrder: 10 },
  { subjectId: SUBJECT_ID, slug: 'statistics', nameTh: 'สถิติและความน่าจะเป็น', nameEn: 'Statistics & Probability', parentSlug: 'math', sortOrder: 15 },
];

const LEARNER_PROFILES: readonly LearnerProfile[] = [
  {
    learnerProfileId: LEARNER_PROFILE_MINOR_ID,
    nickname: 'น้องฟ้า',
    gradeLevel: 'Secondary5',
    isMinor: true,
    guardianConsentAtUtc: '2026-10-01T03:00:00Z',
    guardianConsentVersion: '2026-10-v1',
    isActive: true,
    anonymizedAtUtc: null,
    guardianConsentWithdrawnAtUtc: null,
  },
  {
    learnerProfileId: LEARNER_PROFILE_ADULT_ID,
    nickname: 'พี่กล้า',
    gradeLevel: 'Adult',
    isMinor: false,
    guardianConsentAtUtc: null,
    guardianConsentVersion: null,
    isActive: true,
    anonymizedAtUtc: null,
    guardianConsentWithdrawnAtUtc: null,
  },
];

const CANCELLATION_POLICY: CancellationPolicy = {
  fullRefundHours: 24,
  fullRefundPercent: 100,
  lateRefundPercent: 50,
  tutorCancelRefundPercent: 100,
  tutorNoShowRefundPercent: 100,
  learnerNoShowRefundPercent: 0,
  disputeWindowHours: 48,
};

const ALLOWED_DURATIONS: readonly number[] = [30, 45, 60];
const ALLOWED_BUFFERS: readonly number[] = [0, 5, 10, 15];

const OFFERING: TutorOffering = {
  offeringId: OFFERING_ID,
  subject: { subjectId: SUBJECT_ID, slug: 'statistics', nameTh: 'สถิติและความน่าจะเป็น', nameEn: 'Statistics & Probability' },
  level: 'UpperSecondary',
  curriculum: 'Thai',
  hourlyRateOneOnOne: 650,
  groupHourlyRatePerSeat: null,
  groupMaxSeats: null,
  trialEnabled: true,
  trialMinutes: 30,
  trialPrice: 0,
  isActive: true,
};

interface BookingState {
  readonly booking: Booking;
  /** The test's lever for "the class room opens now" (the real server opens it 15 minutes before the start). */
  joinForcedOpen: boolean;
}

interface KycState {
  status: AdminKycCaseDetail['status'];
  tutorStatus: AdminKycCaseDetail['tutorStatus'];
  decidedAtUtc: string | null;
  decisionNote: string | null;
  documentStatus: AdminKycCaseDetail['documents'][number]['status'];
  rowVersion: string;
}

export interface MockOptions {
  /** Weekly hours the tutor starts with. Default: none (the tutor has not published any hours yet). */
  readonly rules?: readonly AvailabilityRule[];
}

export class TutoringMockApi {
  /** Every request that reached the API, in order, with its parsed query and JSON body. */
  readonly requests: RecordedRequest[] = [];
  /** `METHOD /path` of every request no handler answered. A healthy run leaves this empty. */
  readonly unmocked: string[] = [];
  /** URLs outside localhost the browser asked for (blocked here; a test may assert on them, e.g. the Meet room). */
  readonly external: string[] = [];

  private readonly mutated = new Set((process.env['E2E_MUTATE'] ?? '').split(',').map((part) => part.trim()).filter(Boolean));
  private rules: AvailabilityRule[];
  private settings: AvailabilitySettings = { minNoticeHours: 24, bufferMinutes: 10, maxAdvanceDays: 60, rowVersion: 'AAAAAAAAB9E=' };
  private readonly bookings: BookingState[] = [];
  private bookingSeq = 0;
  private readonly kyc: KycState = {
    status: 'Submitted',
    tutorStatus: 'PendingVerification',
    decidedAtUtc: null,
    decisionNote: null,
    documentStatus: 'Pending',
    rowVersion: 'BBBBBBBBB9E=',
  };
  private readonly routes: readonly MockRoute[];

  constructor(options: MockOptions = {}) {
    this.rules = [...(options.rules ?? [])];
    this.routes = this.buildRoutes();
  }

  // --- Public levers for tests -------------------------------------------------------------------------------------------

  /** Bookings the page created, newest last. */
  get createdBookings(): readonly Booking[] {
    return this.bookings.map((state) => state.booking);
  }

  /** "Now the class is about to start": the join window of every booking opens. */
  openJoinWindow(): void {
    for (const state of this.bookings) {
      state.joinForcedOpen = true;
    }
  }

  /**
   * Creates a confirmed free trial exactly as `POST /tutoring/bookings` would (same validation, same state change) without a browser.
   * For the quality audit, which needs pages that already hold a booking; the acceptance specs never use it - they click.
   */
  seedFreeTrial(startsAtUtc: string, learnerProfileId: string = LEARNER_PROFILE_MINOR_ID): Booking {
    const reply = this.createBooking({
      method: 'POST',
      path: '/tutoring/bookings',
      query: {},
      body: { offeringId: OFFERING_ID, startsAtUtc, durationMinutes: 30, format: 'OneOnOne', learnerProfileId, isTrial: true },
    });
    if (reply.status !== 201) {
      throw new Error(`Could not seed a booking at ${startsAtUtc}: ${JSON.stringify(reply.body)}`);
    }
    return reply.body as Booking;
  }

  /** Requests of one endpoint, for assertions on what the page really sent. */
  sent(method: string, path: RegExp | string): readonly RecordedRequest[] {
    return this.requests.filter((request) => request.method === method && (typeof path === 'string' ? request.path === path : path.test(request.path)));
  }

  /** The tutor's current weekly hours as the server holds them. */
  get weeklyRules(): readonly AvailabilityRule[] {
    return this.rules;
  }

  // --- Wiring ------------------------------------------------------------------------------------------------------------

  /**
   * Answers every `/api/**` request of the context (and of any popup it opens) from this mock, signed in as `who`, and keeps the
   * browser off the internet: fonts and the Meet room are stubbed so a run is the same offline and online.
   */
  async attach(context: BrowserContext, who: SignedInAs): Promise<void> {
    await context.route(
      (url) => url.pathname.startsWith('/api/') && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'),
      (route) => this.answer(route, who),
    );
    await context.route(
      (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
      async (route) => {
        const request = route.request();
        this.external.push(request.url());
        const type = request.resourceType();
        await route.fulfill({
          status: 200,
          contentType: type === 'stylesheet' ? 'text/css' : type === 'document' ? 'text/html' : 'application/octet-stream',
          body: type === 'document' ? '<!doctype html><title>external page (stubbed by the test)</title>' : '',
        });
      },
    );
  }

  private async answer(route: Route, who: SignedInAs): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const recorded: RecordedRequest = {
      method: request.method(),
      path: url.pathname.replace(/^\/api/, ''),
      query: Object.fromEntries(url.searchParams),
      body: parseBody(request),
    };
    this.requests.push(recorded);

    if (recorded.path === '/identity/refresh' && recorded.method === 'POST') {
      return respond(route, who === null ? problem(401, 'auth.unauthorized') : { body: this.refresh(who) });
    }
    if (recorded.path === '/identity/me' && recorded.method === 'GET') {
      return respond(route, who === null ? problem(401, 'auth.unauthorized') : { body: this.me(who) });
    }

    for (const candidate of this.routes) {
      const match = candidate.pattern.exec(recorded.path);
      if (candidate.method === recorded.method && match !== null && !this.mutated.has(candidate.name)) {
        return respond(route, candidate.handle(recorded, match));
      }
    }
    this.unmocked.push(`${recorded.method} ${recorded.path}`);
    return respond(route, problem(501, 'e2e.not_mocked'));
  }

  private refresh(who: Exclude<SignedInAs, null>): RefreshResponse {
    const userId = who === 'Learner' ? LEARNER_USER_ID : who === 'Instructor' ? TUTOR_USER_ID : ADMIN_USER_ID;
    const base64 = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${base64({ alg: 'none', typ: 'JWT' })}.${base64({ sub: userId, role: [who], sid: '0192e2b3-0007-7000-8000-000000000001', exp: expiresAt })}.e2e`;
    return { accessToken: token, accessTokenExpiresAtUtc: iso(expiresAt * 1000) };
  }

  private me(who: Exclude<SignedInAs, null>): MeResponse {
    const people = {
      Learner: { id: LEARNER_USER_ID, email: 'learner1.seed@example.test', displayName: 'สมหญิง นักเรียน' },
      Instructor: { id: TUTOR_USER_ID, email: 'tutor1.seed@example.test', displayName: 'สมชาย รุ่งเรืองกิจ' },
      Admin: { id: ADMIN_USER_ID, email: 'admin.seed@example.test', displayName: 'ผู้ดูแลระบบ' },
    } as const;
    return { ...people[who], avatarUrl: null, roles: [who] };
  }

  // --- State -> DTO -------------------------------------------------------------------------------------------------------

  private slotsBetween(fromMs: number, toMs: number, durationMinutes: number): TutorSlot[] {
    const now = Date.now();
    const earliest = now + this.settings.minNoticeHours * HOUR_MS;
    const latest = now + this.settings.maxAdvanceDays * 24 * HOUR_MS;
    const slots: TutorSlot[] = [];
    // Walk the Bangkok calendar days that touch [from, to): from the Bangkok midnight of `from` up to `to`.
    for (let cursor = bangkokInstant(bangkokDay(fromMs).date, '00:00'); cursor < toMs; cursor += 24 * HOUR_MS) {
      const { date, dayOfWeek } = bangkokDay(cursor);
      for (const rule of this.rules.filter((candidate) => candidate.dayOfWeek === dayOfWeek)) {
        const windowEnd = bangkokInstant(date, rule.endLocal);
        for (let start = bangkokInstant(date, rule.startLocal); start + durationMinutes * 60_000 <= windowEnd; start += GRID_MINUTES * 60_000) {
          const end = start + durationMinutes * 60_000;
          const taken = this.bookings.some(
            (state) =>
              (state.booking.status === 'Confirmed' || state.booking.status === 'PendingPayment') &&
              Date.parse(state.booking.startsAtUtc) < end &&
              Date.parse(state.booking.endsAtUtc) > start,
          );
          if (start >= fromMs && start < toMs && start >= earliest && start <= latest && !taken && !slots.some((slot) => slot.startsAtUtc === iso(start))) {
            slots.push({ startsAtUtc: iso(start), endsAtUtc: iso(end), seatsLeft: 1, joinsExistingGroup: false });
          }
        }
      }
    }
    return slots.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
  }

  private nextAvailable(): string | null {
    const now = Date.now();
    return this.slotsBetween(now, now + 14 * 24 * HOUR_MS, 30)[0]?.startsAtUtc ?? null;
  }

  private profile(): TutorPublicProfile {
    return {
      slug: TUTOR_SLUG,
      displayName: TUTOR_NAME,
      headline: 'ติวเตอร์คณิตศาสตร์และสถิติธุรกิจ ประสบการณ์ 12 ปี',
      bio: 'อดีต Marketing Manager บริษัท FMCG ชั้นนำ และผู้เชี่ยวชาญด้านสถิติและคณิตศาสตร์ธุรกิจ',
      photoUrl: null,
      introVideo: null,
      gender: 'Male',
      yearsExperience: 12,
      ratingAverage: 4.9,
      ratingCount: 18,
      completedSessionsCount: 42,
      verified: true,
      verifiedAtUtc: '2026-10-15T00:00:00Z',
      minNoticeHours: this.settings.minNoticeHours,
      maxAdvanceDays: this.settings.maxAdvanceDays,
      nextAvailableAtUtc: this.nextAvailable(),
      timezone: 'Asia/Bangkok',
      allowedDurationMinutes: ALLOWED_DURATIONS,
      offerings: [
        {
          offeringId: OFFERING_ID,
          subject: { slug: 'statistics', nameTh: 'สถิติและความน่าจะเป็น', nameEn: 'Statistics & Probability' },
          level: 'UpperSecondary',
          curriculum: 'Thai',
          hourlyRateOneOnOne: 650,
          groupHourlyRatePerSeat: null,
          groupMaxSeats: null,
          trial: { minutes: 30, price: 0, isFree: true },
        },
      ],
      educations: [{ institution: 'จุฬาลงกรณ์มหาวิทยาลัย', degree: 'ปริญญาตรี', field: 'สถิติประยุกต์', yearFrom: 2008, yearTo: 2012 }],
      certificates: [],
    };
  }

  private searchItem(): TutorSearchItem {
    return {
      slug: TUTOR_SLUG,
      displayName: TUTOR_NAME,
      headline: 'ติวเตอร์คณิตศาสตร์และสถิติธุรกิจ ประสบการณ์ 12 ปี',
      photoUrl: null,
      gender: 'Male',
      yearsExperience: 12,
      ratingAverage: 4.9,
      ratingCount: 18,
      completedSessionsCount: 42,
      subjects: [{ slug: 'statistics', nameTh: 'สถิติและความน่าจะเป็น', nameEn: 'Statistics & Probability' }],
      levels: ['UpperSecondary'],
      curricula: ['Thai'],
      fromHourlyRate: 650,
      hasGroup: false,
      hasTrial: true,
      hasFreeTrial: true,
      nextAvailableAtUtc: this.nextAvailable(),
    };
  }

  private search(query: Readonly<Record<string, string>>): TutorSearchResponse {
    const needle = (query['q'] ?? '').trim().toLowerCase();
    const item = this.searchItem();
    const haystack = [item.displayName, item.headline ?? '', ...item.subjects.flatMap((subject) => [subject.nameTh, subject.nameEn])].join(' ').toLowerCase();
    const items = needle === '' || haystack.includes(needle) ? [item] : [];
    const pageSize = Number(query['pageSize'] ?? 12);
    return {
      results: { items, totalCount: items.length, page: 1, pageSize, totalPages: items.length === 0 ? 0 : 1 },
      facets:
        query['facets'] === 'false'
          ? null
          : {
              subjects: [{ slug: 'statistics', nameTh: 'สถิติและความน่าจะเป็น', nameEn: 'Statistics & Probability', parentSlug: 'math', count: items.length }],
              levels: [{ level: 'UpperSecondary', count: items.length }],
              curricula: [{ curriculum: 'Thai', count: items.length }],
              genders: [{ gender: 'Male', count: items.length }],
              formats: [{ format: 'OneOnOne', count: items.length }],
              trialCount: items.length,
              hourlyRate: items.length === 0 ? null : { min: 650, max: 650 },
            },
    };
  }

  private slotsResponse(query: Readonly<Record<string, string>>): TutorSlotsResponse {
    const trial = query['trial'] === 'true';
    const duration = trial ? 30 : Number(query['durationMinutes'] ?? 60);
    const from = Date.parse(query['from'] ?? iso(Date.now()));
    const to = Date.parse(query['to'] ?? iso(from + 7 * 24 * HOUR_MS));
    return {
      tutorSlug: TUTOR_SLUG,
      offeringId: OFFERING_ID,
      format: 'OneOnOne',
      durationMinutes: duration,
      isTrial: trial,
      quote: trial
        ? { amount: 0, currency: 'THB', durationMinutes: duration, hourlyRate: null, isFree: true }
        : { amount: (650 * duration) / 60, currency: 'THB', durationMinutes: duration, hourlyRate: 650, isFree: false },
      timezone: 'Asia/Bangkok',
      serverTimeUtc: iso(Date.now()),
      fromUtc: iso(from),
      toUtc: iso(to),
      minNoticeHours: this.settings.minNoticeHours,
      maxAdvanceDays: this.settings.maxAdvanceDays,
      slots: this.slotsBetween(from, to, duration),
    };
  }

  private bookingOf(state: BookingState): Booking {
    const booking = state.booking;
    const startsAt = Date.parse(booking.startsAtUtc);
    const open = state.joinForcedOpen || (Date.now() >= startsAt - JOIN_OPENS_BEFORE_START_MS && Date.now() <= Date.parse(booking.endsAtUtc));
    return { ...booking, serverTimeUtc: iso(Date.now()), canJoin: booking.status === 'Confirmed' && open };
  }

  private listItem(booking: Booking): BookingListItem {
    const { bookingId, bookingNo, status, isTrial, format, priceAmount, currency, startsAtUtc, endsAtUtc, durationMinutes, tutor, offering, learner } = booking;
    return {
      bookingId,
      bookingNo,
      status,
      isTrial,
      format,
      priceAmount,
      currency,
      startsAtUtc,
      endsAtUtc,
      durationMinutes,
      tutor,
      offering,
      learner,
      holdExpiresAtUtc: booking.holdExpiresAtUtc,
      requiresPayment: booking.requiresPayment,
      packagePurchaseId: booking.packagePurchaseId,
      joinOpensAtUtc: booking.joinOpensAtUtc,
      canJoin: booking.canJoin,
      serverTimeUtc: booking.serverTimeUtc,
      refundedAmount: booking.refundedAmount,
      sessionId: booking.sessionId,
      attendance: null,
      disputeId: null,
      disputeWindowEndsAtUtc: null,
    };
  }

  private createBooking(request: RecordedRequest): Reply {
    const body = asRecord(request.body);
    const wrong = (field: string): Reply => problem(400, 'validation', `${field} is missing or has the wrong type`);
    if (typeof body['offeringId'] !== 'string') return wrong('offeringId');
    if (typeof body['startsAtUtc'] !== 'string' || !/(Z|[+-]\d\d:\d\d)$/i.test(body['startsAtUtc'])) return wrong('startsAtUtc');
    if (typeof body['durationMinutes'] !== 'number') return wrong('durationMinutes');
    if (body['format'] !== 'OneOnOne' && body['format'] !== 'Group') return wrong('format');
    if (typeof body['learnerProfileId'] !== 'string') return wrong('learnerProfileId');
    if (typeof body['isTrial'] !== 'boolean') return wrong('isTrial');
    const command = body as unknown as CreateBookingRequest;

    const learner = LEARNER_PROFILES.find((profile) => profile.learnerProfileId === command.learnerProfileId);
    if (command.offeringId !== OFFERING_ID) return problem(404, 'tutoring.offering_not_found');
    if (learner === undefined) return problem(404, 'tutoring.learner_profile_not_found');
    if (command.isTrial && command.durationMinutes !== 30) return problem(409, 'tutoring.trial_not_available');
    const start = Date.parse(command.startsAtUtc);
    const open = this.slotsBetween(start, start + 1, command.durationMinutes).some((slot) => Date.parse(slot.startsAtUtc) === start);
    if (!open) return problem(409, 'tutoring.slot_unavailable');

    this.bookingSeq += 1;
    const seq = String(this.bookingSeq).padStart(12, '0');
    const price = command.isTrial ? 0 : (650 * command.durationMinutes) / 60;
    const now = Date.now();
    const confirmed = price === 0;
    const booking: Booking = {
      bookingId: `0192e2b3-0004-7000-8000-${seq}`,
      sessionId: `0192e2b3-0005-7000-8000-${seq}`,
      bookingNo: `TB-261021-${String(this.bookingSeq).padStart(6, '0')}`,
      status: confirmed ? 'Confirmed' : 'PendingPayment',
      isTrial: command.isTrial,
      format: command.format,
      priceAmount: price,
      currency: 'THB',
      startsAtUtc: iso(start),
      endsAtUtc: iso(start + command.durationMinutes * 60_000),
      durationMinutes: command.durationMinutes,
      tutor: { slug: TUTOR_SLUG, displayName: TUTOR_NAME, photoUrl: null },
      offering: { offeringId: OFFERING_ID, subjectNameTh: OFFERING.subject.nameTh, subjectNameEn: OFFERING.subject.nameEn, level: OFFERING.level, curriculum: OFFERING.curriculum },
      learner: { learnerProfileId: learner.learnerProfileId, nickname: learner.nickname, gradeLevel: learner.gradeLevel },
      holdExpiresAtUtc: confirmed ? null : iso(now + 15 * 60_000),
      requiresPayment: !confirmed,
      paymentId: null,
      refundedAmount: 0,
      confirmedAtUtc: confirmed ? iso(now) : null,
      createdAtUtc: iso(now),
      serverTimeUtc: iso(now),
      packagePurchaseId: null,
      joinOpensAtUtc: iso(start - JOIN_OPENS_BEFORE_START_MS),
      canJoin: false,
      attendance: null,
      disputeId: null,
      disputeWindowEndsAtUtc: null,
    };
    this.bookings.push({ booking, joinForcedOpen: false });
    return { status: 201, body: booking };
  }

  private classes(): PagedResult<TutorClassListItem> {
    const now = Date.now();
    const items: TutorClassListItem[] = this.bookings
      .filter((state) => state.booking.status === 'Confirmed')
      .map((state) => {
        const booking = state.booking;
        const opens = Date.parse(booking.startsAtUtc) - JOIN_OPENS_BEFORE_START_MS;
        return {
          sessionId: booking.sessionId,
          startsAtUtc: booking.startsAtUtc,
          endsAtUtc: booking.endsAtUtc,
          status: 'Scheduled',
          format: booking.format,
          isTrial: booking.isTrial,
          offering: booking.offering,
          learners: [{ nickname: booking.learner.nickname, gradeLevel: booking.learner.gradeLevel, isMinor: true, bookingId: booking.bookingId, status: booking.status, disputeId: null }],
          seatsTaken: null,
          capacity: null,
          startOpensAtUtc: iso(opens),
          canStart: now >= opens,
          completeOpensAtUtc: booking.endsAtUtc,
          canComplete: false,
          learnerPresent: false,
          needsSummary: false,
          summaryEditableUntilUtc: null,
          room: { state: 'Ready', needsAction: 'None' },
          serverTimeUtc: iso(now),
        };
      });
    return { items, totalCount: items.length, page: 1, pageSize: 10, totalPages: items.length === 0 ? 0 : 1 };
  }

  private availability(): TutorAvailability {
    return {
      timezone: 'Asia/Bangkok',
      settings: this.settings,
      rules: this.rules,
      maxRules: 50,
      allowedDurationMinutes: ALLOWED_DURATIONS,
      allowedBufferMinutes: ALLOWED_BUFFERS,
    };
  }

  private tutorProfile(): TutorProfile {
    return {
      tutorId: TUTOR_ID,
      slug: TUTOR_SLUG,
      displayName: TUTOR_NAME,
      headline: 'ติวเตอร์คณิตศาสตร์และสถิติธุรกิจ ประสบการณ์ 12 ปี',
      bio: 'อดีต Marketing Manager บริษัท FMCG ชั้นนำ',
      gender: 'Male',
      yearsExperience: 12,
      status: 'Verified',
      statusReason: null,
      isListed: true,
      photoUrl: null,
      introVideoAssetId: null,
      minNoticeHours: this.settings.minNoticeHours,
      bufferMinutes: this.settings.bufferMinutes,
      maxAdvanceDays: this.settings.maxAdvanceDays,
      verifiedAtUtc: '2026-10-15T00:00:00Z',
      readiness: { canSubmitForVerification: false, blockers: [] },
      allowedDurationMinutes: ALLOWED_DURATIONS,
      rowVersion: 'AAAAAAAAB9E=',
    };
  }

  private kycDetail(): AdminKycCaseDetail {
    return {
      caseId: KYC_CASE_ID,
      tutorId: TUTOR_ID,
      tutorDisplayName: 'สมชาย รุ่งเรืองกิจ',
      gender: 'Male',
      headline: 'ผู้เชี่ยวชาญสถิติธุรกิจ',
      attemptNo: 1,
      status: this.kyc.status,
      submittedAtUtc: '2026-10-20T10:00:00Z',
      decidedAtUtc: this.kyc.decidedAtUtc,
      decidedByUserId: this.kyc.decidedAtUtc === null ? null : ADMIN_USER_ID,
      decisionNote: this.kyc.decisionNote,
      consentVersion: '2026-10-v1',
      consentAtUtc: '2026-10-20T09:55:00Z',
      tutorStatus: this.kyc.tutorStatus,
      requiredDocumentTypes: ['IdCard'],
      documents: [
        {
          documentId: KYC_DOCUMENT_ID,
          type: 'IdCard',
          status: this.kyc.documentStatus,
          contentType: 'image/jpeg',
          sizeBytes: 102_400,
          uploadedAtUtc: '2026-10-20T09:58:00Z',
          expiresAtUtc: null,
          purgeAfterUtc: null,
          purged: false,
          sameFileSeenFromOtherTutors: 0,
        },
      ],
      rowVersion: this.kyc.rowVersion,
    };
  }

  private kycListItem(): AdminKycCaseListItem {
    return {
      caseId: KYC_CASE_ID,
      tutorId: TUTOR_ID,
      tutorDisplayName: 'สมชาย รุ่งเรืองกิจ',
      attemptNo: 1,
      status: this.kyc.status,
      submittedAtUtc: '2026-10-20T10:00:00Z',
      documentCount: 1,
      waitingHours: 14,
    };
  }

  private decideKyc(request: RecordedRequest): Reply {
    const body = asRecord(request.body);
    if (body['decision'] !== 'Approve' && body['decision'] !== 'Reject' && body['decision'] !== 'NeedsInfo') return problem(400, 'validation', 'decision');
    if (typeof body['rowVersion'] !== 'string') return problem(400, 'validation', 'rowVersion');
    if (!Array.isArray(body['documents'])) return problem(400, 'validation', 'documents');
    const command = body as unknown as DecideKycCaseRequest;
    if (command.rowVersion !== this.kyc.rowVersion) return problem(409, 'tutoring.concurrent_update');
    if (this.kyc.status !== 'Submitted' && this.kyc.status !== 'InReview') return problem(409, 'tutoring.kyc_case_not_decidable');
    if (command.decision !== 'Approve' && (command.note ?? '').trim() === '') return problem(400, 'validation', 'note');
    const verdict = command.documents.find((document) => document.documentId === KYC_DOCUMENT_ID);
    if (command.decision === 'Approve' && verdict?.status !== 'Approved') return problem(409, 'tutoring.kyc_documents_pending');

    this.kyc.status = command.decision === 'Approve' ? 'Approved' : command.decision === 'Reject' ? 'Rejected' : 'NeedsInfo';
    this.kyc.tutorStatus = command.decision === 'Approve' ? 'Verified' : command.decision === 'Reject' ? 'Rejected' : 'NeedsInfo';
    this.kyc.decidedAtUtc = iso(Date.now());
    this.kyc.decisionNote = command.note;
    this.kyc.documentStatus = verdict?.status ?? this.kyc.documentStatus;
    this.kyc.rowVersion = 'BBBBBBBBB9I=';
    return { body: this.kycDetail() };
  }

  // --- The routes ---------------------------------------------------------------------------------------------------------

  private buildRoutes(): readonly MockRoute[] {
    const paged = <T>(items: readonly T[]): PagedResult<T> => ({ items, totalCount: items.length, page: 1, pageSize: 50, totalPages: items.length === 0 ? 0 : 1 });
    const route = (name: string, method: string, pattern: RegExp, handle: Handler): MockRoute => ({ name, method, pattern, handle });
    const slug = `/tutoring/tutors/${TUTOR_SLUG}`;
    const reviews: TutorReviewsResponse = {
      summary: { ratingAverage: 0, ratingCount: 0, distribution: { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 } },
      reviews: paged([]),
    };

    return [
      // The login page (a signed-out visitor is sent there) asks which social sign-ins are switched on: none here.
      route('oauth-clients', 'GET', /^\/auth\/oauth-clients$/,() => ({ body: { google: null } satisfies OAuthClientsResponse })),

      // Site chrome that every page of the shell asks for. A person with no courses, categories or notifications is a real state.
      route('categories', 'GET', /^\/catalog\/categories$/, () => ({ body: [] as readonly CategoryTreeNode[] })),
      route('wishlist', 'GET', /^\/catalog\/wishlist$/, () => ({ body: [] as readonly WishlistCourseItemResponse[] })),
      route('notifications', 'GET', /^\/notifications\/my$/, () => ({ body: [] as readonly UserNotificationResponse[] })),

      // The instructor studio guard asks whether the caller is an approved instructor.
      route('instructor-me', 'GET', /^\/catalog\/instructors\/me$/, () => ({
        body: {
          id: '0192e2b3-0006-7000-8000-000000000001',
          userId: TUTOR_USER_ID,
          displayName: 'สมชาย รุ่งเรืองกิจ',
          headline: null,
          bio: 'ติวเตอร์สถิติและคณิตศาสตร์',
          revenueSharePercent: 70,
          status: 'Approved',
          approvedAtUtc: '2026-10-15T00:00:00Z',
        } satisfies InstructorProfileResponse,
      })),

      // Public marketplace
      route('subjects', 'GET', /^\/tutoring\/subjects$/, () => ({ body: paged(SUBJECTS) })),
      route('search', 'GET', /^\/tutoring\/tutors$/, (request) => ({ body: this.search(request.query) })),
      route('profile', 'GET', new RegExp(`^${slug}$`), () => ({ body: this.profile() })),
      route('profile-missing', 'GET', /^\/tutoring\/tutors\/[^/]+$/, () => problem(404, 'tutoring.tutor_not_found')),
      route('slots', 'GET', new RegExp(`^${slug}/slots$`), (request) => ({ body: this.slotsResponse(request.query) })),
      route('reviews', 'GET', new RegExp(`^${slug}/reviews$`), () => ({ body: reviews })),
      route('packages', 'GET', new RegExp(`^${slug}/packages$`), () => ({ body: [] })),
      route('policy', 'GET', /^\/tutoring\/cancellation-policy$/, () => ({ body: CANCELLATION_POLICY })),

      // Learner
      route('learner-profiles', 'GET', /^\/tutoring\/learner-profiles$/, () => ({ body: paged(LEARNER_PROFILES) })),
      route('bookings', 'POST', /^\/tutoring\/bookings$/, (request) => this.createBooking(request)),
      route('bookings-my', 'GET', /^\/tutoring\/bookings\/my$/, (request) => {
        const upcoming = this.bookings.map((state) => this.bookingOf(state)).filter((booking) => booking.status === 'Confirmed' || booking.status === 'PendingPayment');
        const items = request.query['scope'] === 'past' ? [] : upcoming.map((booking) => this.listItem(booking));
        return { body: { items, totalCount: items.length, page: 1, pageSize: 10, totalPages: items.length === 0 ? 0 : 1 } satisfies PagedResult<BookingListItem> };
      }),
      route('booking', 'GET', /^\/tutoring\/bookings\/([^/]+)$/, (_request, match) => {
        const state = this.bookings.find((candidate) => candidate.booking.bookingId === match[1]);
        return state === undefined ? problem(404, 'tutoring.booking_not_found') : { body: this.bookingOf(state) };
      }),
      route('join', 'POST', /^\/tutoring\/sessions\/([^/]+)\/join$/, (_request, match) => {
        const state = this.bookings.find((candidate) => candidate.booking.sessionId === match[1]);
        if (state === undefined) return problem(404, 'tutoring.not_found');
        const booking = this.bookingOf(state);
        if (!booking.canJoin) {
          return problem(409, 'tutoring.window_not_open', undefined, { opensAtUtc: booking.joinOpensAtUtc, serverTimeUtc: iso(Date.now()) });
        }
        const joined: JoinTutoringSessionResponse = {
          sessionId: booking.sessionId,
          role: 'Learner',
          meetUrl: MEET_URL,
          startsAtUtc: booking.startsAtUtc,
          endsAtUtc: booking.endsAtUtc,
          serverTimeUtc: iso(Date.now()),
        };
        return { body: joined };
      }),

      // Tutor portal
      route('tutor-profile', 'GET', /^\/tutoring\/tutor\/profile$/, () => ({ body: this.tutorProfile() })),
      route('tutor-offerings', 'GET', /^\/tutoring\/tutor\/offerings$/, () => ({ body: paged([OFFERING]) })),
      route('tutor-availability', 'GET', /^\/tutoring\/tutor\/availability$/, () => ({ body: this.availability() })),
      route('tutor-exceptions', 'GET', /^\/tutoring\/tutor\/availability\/exceptions$/, () => ({ body: paged<AvailabilityException>([]) })),
      route('rules', 'PUT', /^\/tutoring\/tutor\/availability\/rules$/, (request) => {
        const body = asRecord(request.body);
        if (!Array.isArray(body['rules'])) return problem(400, 'validation', 'rules');
        this.rules = [...(body as unknown as ReplaceRulesRequest).rules];
        return { body: this.availability() };
      }),
      route('settings', 'PUT', /^\/tutoring\/tutor\/availability\/settings$/, (request) => {
        const body = request.body as SettingsRequest;
        if (body.rowVersion !== this.settings.rowVersion) return problem(409, 'tutoring.concurrent_update');
        this.settings = { ...body, rowVersion: 'AAAAAAAAB9I=' };
        return { body: this.settings };
      }),
      route('tutor-classes', 'GET', /^\/tutoring\/tutor\/classes$/, () => ({ body: this.classes() })),

      // Admin KYC
      route('kyc-queue', 'GET', /^\/tutoring\/admin\/kyc\/cases$/, (request) => {
        const wanted = (request.query['status'] ?? '').split(',').filter(Boolean);
        const shown = wanted.length === 0 || wanted.includes(this.kyc.status);
        return { body: paged(shown ? [this.kycListItem()] : []) };
      }),
      route('kyc-case', 'GET', /^\/tutoring\/admin\/kyc\/cases\/([^/]+)$/, (_request, match) => (match[1] === KYC_CASE_ID ? { body: this.kycDetail() } : problem(404, 'tutoring.kyc_case_not_found'))),
      route('kyc-start', 'POST', /^\/tutoring\/admin\/kyc\/cases\/([^/]+)\/start-review$/, () => {
        if (this.kyc.status === 'Submitted') this.kyc.status = 'InReview';
        return { body: this.kycDetail() };
      }),
      route('approve', 'POST', /^\/tutoring\/admin\/kyc\/cases\/([^/]+)\/decision$/, (request) => this.decideKyc(request)),
    ];
  }
}

// --- Plumbing -----------------------------------------------------------------------------------------------------------------

function parseBody(request: Request): unknown {
  const text = request.postData();
  if (text === null || text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** An RFC 9457 problem the way `ToProblemHttpResult` writes it: `reason` and any extension are top-level members. */
function problem(status: number, reason: string, detail?: string, extensions: Record<string, unknown> = {}): Reply {
  return {
    status,
    body: {
      type: `https://httpstatuses.io/${status}`,
      title: reason,
      status,
      detail: detail ?? reason,
      errorCode: status === 409 ? 'conflict' : status === 404 ? 'not_found' : status === 401 ? 'unauthorized' : 'validation',
      reason,
      traceId: '00-e2e-mock-00',
      ...extensions,
    },
  };
}

async function respond(route: Route, reply: Reply): Promise<void> {
  const status = reply.status ?? 200;
  await route.fulfill({
    status,
    contentType: status >= 400 ? 'application/problem+json' : 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: reply.body === undefined ? '' : JSON.stringify(reply.body),
  });
}
