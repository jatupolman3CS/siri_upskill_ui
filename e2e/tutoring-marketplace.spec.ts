import { type BrowserContext, type Locator, type Page, expect, test as base } from '@playwright/test';

import {
  KYC_CASE_ID,
  KYC_DOCUMENT_ID,
  LEARNER_PROFILE_ADULT_ID,
  LEARNER_PROFILE_MINOR_ID,
  MEET_URL,
  OFFERING_ID,
  type MockOptions,
  type SignedInAs,
  TUTOR_SLUG,
  TutoringMockApi,
  bangkokDayPlus,
  bangkokInstant,
} from './tutoring-mock-api';
import { th } from './tutoring-texts';

/**
 * P13-31 E2E acceptance suite of the Tutor Marketplace.
 *
 * Every test drives the REAL pages in a browser; only the API is faked, by `tutoring-mock-api.ts` - a stateful stand-in whose bodies are
 * typed against the app's models and checked against the C# records, and whose state changes only when the page really sends a request.
 * So a test here goes red when the page stops sending the request (or sends a different one), not merely when a heading disappears:
 *
 * - Flow A  search -> profile -> pick a slot -> booking page (learner, policy) -> POST bookings -> checkout -> My tutoring -> join.
 *           Nothing navigates by URL after the first page: every step is a click, and the request that left the browser is asserted.
 * - Flow B  the tutor saves weekly hours (PUT rules) -> a learner books one of those times -> the class shows up for the tutor and the
 *           booked time leaves the tutor's preview.
 * - Flow C  an admin opens a KYC case, judges the document, approves it (POST decision) and sees the status change.
 * - i18n    the language switch is clicked and specific Thai text becomes specific English text (and back).
 *
 * Every test also fails on a `pageerror`, on any `console.error`, and on an API call nobody mocked (see `harness` below).
 * Mutation self-check: `E2E_MUTATE=bookings|approve|join|rules` turns that mock off; the matching test must go red.
 */

// --- The harness: one mock per test, a signed-in page per person, and the "nothing may be wrong" guard ---------------------

interface Harness {
  readonly mock: TutoringMockApi;
  /** A fresh browser context (own cookies and memory) signed in as `who`, answered by this test's shared mock. */
  pageFor(who: SignedInAs): Promise<Page>;
  /**
   * Declare that a failed API response is the EXPECTED outcome of this test (the browser logs every 4xx/5xx as a console error).
   * Without this call such a response fails the test like any other console error.
   */
  allowFailedResource(status: number, urlPart: string): void;
}

const test = base.extend<{ harness: Harness; mockOptions: MockOptions }>({
  mockOptions: [{}, { option: true }],
  harness: async ({ browser, mockOptions }, use) => {
    const mock = new TutoringMockApi(mockOptions);
    const contexts: BrowserContext[] = [];
    const problems: string[] = [];
    // The one failed response every signed-out visitor produces: the shell asks the API to refresh the session and is told 401
    // (documented in AuthService.initSession). Anything else must be declared by the test with allowFailedResource().
    const allowed: { readonly status: number; readonly urlPart: string }[] = [{ status: 401, urlPart: '/api/identity/refresh' }];

    const watch = (context: BrowserContext): void => {
      context.on('weberror', (error) => problems.push(`uncaught page error: ${error.error().message}`));
      context.on('console', (message) => {
        if (message.type() !== 'error') {
          return;
        }
        const url = message.location().url;
        const expected = allowed.some((entry) => message.text().includes(`status of ${entry.status}`) && url.includes(entry.urlPart));
        if (!expected) {
          problems.push(`console.error: ${message.text()}${url === '' ? '' : ` (${url})`}`);
        }
      });
    };

    await use({
      mock,
      pageFor: async (who) => {
        const context = await browser.newContext();
        contexts.push(context);
        watch(context);
        // A returning visitor who already answered the cookie question (the most private answer): the banner would otherwise cover
        // the bottom of every page and sit between the test and the buttons it clicks.
        await context.addInitScript(() => {
          // Runs in every document the context opens, including opaque ones (about:blank, error pages) that may not touch storage.
          if (location.protocol.startsWith('http') && location.hostname === 'localhost') {
            localStorage.setItem('siri_pdpa_consent', JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: '2026-10-01T00:00:00.000Z' }));
          }
        });
        await mock.attach(context, who);
        return context.newPage();
      },
      allowFailedResource: (status, urlPart) => allowed.push({ status, urlPart }),
    });

    await Promise.all(contexts.map((context) => context.close()));
    expect(problems, 'the browser reported errors').toEqual([]);
    expect(mock.unmocked, 'the app called API endpoints this test did not mock').toEqual([]);
  },
});

// --- Dates the story needs, relative to "now" so the suite is not day-of-week dependent ------------------------------------

/** The tutor's open day: two Bangkok days from now - always inside the first seven-day calendar window and past the 24 h notice. */
const OPEN_DAY = bangkokDayPlus(Date.now(), 2);
const startOnOpenDay = (hhmm: string): string => new Date(bangkokInstant(OPEN_DAY.date, hhmm)).toISOString();

// --- Small page helpers (all of them click; none of them navigates by URL) ----------------------------------------------

/** The time button of a slot picker whose visible text is exactly the start `time` (the accessible name also contains the end time). */
const slotButton = (scope: Locator, time: string): Locator =>
  scope.getByRole('tabpanel').locator('button[aria-pressed]').filter({ hasText: new RegExp(`^\\s*${time}\\s*$`) });

async function pickTrialSlot(page: Page, time: string): Promise<void> {
  const panel = page.locator('app-tutor-booking-panel');
  await panel.getByLabel(th('tutoring.public.profile.booking.trialLabel', { minutes: 30, price: th('tutoring.public.profile.booking.free') })).check();
  await slotButton(panel, time).click();
}

async function reserveFreeTrialFor(page: Page, learnerProfileId: string): Promise<void> {
  await page.getByRole('combobox', { name: th('tutoring.booking.learner') }).selectOption({ value: learnerProfileId });
  await page.getByRole('button', { name: th('tutoring.booking.reserveFree') }).click();
}

// ===================================================================================================================================
// Route protection
// ===================================================================================================================================

test.describe('Tutor Marketplace - route guards', () => {
  const protectedRoutes = [
    '/my-tutoring',
    '/my-tutoring/bookings/0192e2b3-0000-7000-8000-000000000001',
    '/tutors/test-tutor/book',
    '/account/learner-profiles',
    '/tutoring/checkout/0192e2b3-0000-7000-8000-000000000001',
    '/tutoring/sessions/0192e2b3-0000-7000-8000-000000000001/join',
    '/instructor/tutoring/classes',
    '/instructor/tutoring/availability',
    '/instructor/tutoring/profile',
    '/instructor/tutoring/packages',
    '/instructor/tutoring/disputes',
    '/instructor/tutoring/wallet',
    '/admin/tutoring/kyc',
    '/admin/tutoring/tutors',
    '/admin/tutoring/disputes',
    '/admin/tutoring/analytics',
  ];

  for (const route of protectedRoutes) {
    test(`a signed-out visitor to ${route} is sent to the login page and brought back afterwards`, async ({ harness }) => {
      const page = await harness.pageFor(null);
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?/);
      expect(new URL(page.url()).searchParams.get('returnUrl')).toBe(route);
    });
  }
});

// ===================================================================================================================================
// Public search and profile
// ===================================================================================================================================

test.describe('Tutor Marketplace - public search and profile', () => {
  test('search lists the tutor, sends the typed words and the chosen filter to the API, and says so when nothing matches', async ({ harness }) => {
    const { mock } = harness;
    const page = await harness.pageFor(null);
    await page.goto('/tutors');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(th('tutoring.public.search.heading'));
    await expect(page.getByRole('link', { name: 'สมชาย รุ่งเรืองกิจ (Seed)' })).toBeVisible();
    await expect(page.getByText(th('tutoring.public.search.resultCount', { count: 1 }))).toBeVisible();

    // The facet counts reach the filter options (this is the code that threw on a mock that did not match the real response).
    const level = page.getByLabel(th('tutoring.public.search.filters.level'));
    await expect(level.locator('option[value="UpperSecondary"]')).toContainText('(1)');
    await level.selectOption({ value: 'UpperSecondary' });
    await expect.poll(() => mock.sent('GET', '/tutoring/tutors').some((request) => request.query['level'] === 'UpperSecondary')).toBe(true);

    await page.getByRole('searchbox', { name: th('tutoring.public.search.searchLabel') }).fill('ฟิสิกส์');
    await page.getByRole('search').filter({ has: page.getByRole('searchbox', { name: th('tutoring.public.search.searchLabel') }) }).getByRole('button').click();
    await expect.poll(() => mock.sent('GET', '/tutoring/tutors').some((request) => request.query['q'] === 'ฟิสิกส์')).toBe(true);
    await expect(page.getByRole('heading', { name: th('tutoring.public.search.emptyHeading') })).toBeVisible();
    await expect(page.getByRole('link', { name: 'สมชาย รุ่งเรืองกิจ (Seed)' })).toHaveCount(0);
  });

  test('a tutor that does not exist shows the not-found state and is kept out of search engines', async ({ harness }) => {
    harness.allowFailedResource(404, '/api/tutoring/tutors/non-existent-tutor-slug-99999');
    const page = await harness.pageFor(null);
    await page.goto('/tutors/non-existent-tutor-slug-99999');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(th('tutoring.public.profile.notFoundHeading'));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

// ===================================================================================================================================
// Language switch
// ===================================================================================================================================

test.describe('Tutor Marketplace - language switch', () => {
  test('clicking the language menu turns the Thai search page into English and back, with no raw keys left', async ({ harness }) => {
    const page = await harness.pageFor(null);
    await page.goto('/tutors');

    const heading = page.getByRole('heading', { level: 1 });
    const searchBox = (name: string): Locator => page.getByRole('searchbox', { name, exact: true });
    await expect(heading).toHaveText('ติวเตอร์');
    await expect(searchBox('ค้นหาติวเตอร์')).toBeVisible();
    await expect(page.getByText('พบติวเตอร์ 1 ท่าน')).toBeVisible();
    await expect(page.getByText('เรียงตาม', { exact: true })).toBeVisible();
    await expect(page).toHaveTitle(/^ค้นหาติวเตอร์ \|/);

    const menu = page.locator('app-language-menu');
    await menu.getByRole('button').click();
    await menu.getByRole('menuitemradio', { name: 'English' }).click();

    await expect(heading).toHaveText('Tutors');
    await expect(searchBox('Search tutors')).toBeVisible();
    await expect(page.getByText('1 tutors found')).toBeVisible();
    await expect(page.getByText('Sort by', { exact: true })).toBeVisible();
    await expect(page).toHaveTitle(/^Find a tutor \|/);
    await expect(searchBox('ค้นหาติวเตอร์')).toHaveCount(0);
    await expect(page.getByText('พบติวเตอร์ 1 ท่าน')).toHaveCount(0);
    expect(await page.innerText('body')).not.toMatch(/\btutoring\.(public|learner|tutor|errors|enums|slots|booking|checkout)\.[A-Za-z0-9.]+/);

    await menu.getByRole('button').click();
    await menu.getByRole('menuitemradio', { name: 'ไทย' }).click();
    await expect(heading).toHaveText('ติวเตอร์');
    await expect(searchBox('ค้นหาติวเตอร์')).toBeVisible();
    await expect(searchBox('Search tutors')).toHaveCount(0);
  });
});

// ===================================================================================================================================
// Flow A - search -> profile -> book the free trial -> checkout -> My tutoring -> join
// ===================================================================================================================================

test.describe('Tutor Marketplace - Flow A: a learner books a free trial and joins the class', () => {
  test.use({ mockOptions: { rules: [{ dayOfWeek: OPEN_DAY.dayOfWeek, startLocal: '09:00', endLocal: '12:00' }] } });

  test('every step is a click, the booking request carries what the learner chose, and the join request opens the room', async ({ harness }) => {
    const { mock } = harness;
    const page = await harness.pageFor('Learner');

    // 1. Find the tutor and open the profile.
    await page.goto('/tutors');
    await page.getByRole('link', { name: 'สมชาย รุ่งเรืองกิจ (Seed)' }).click();
    await expect(page).toHaveURL(`/tutors/${TUTOR_SLUG}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('สมชาย รุ่งเรืองกิจ');
    await expect(page.getByText('สถิติและความน่าจะเป็น').first()).toBeVisible();

    // 2. Choose the free trial and a time. The calendar is asked for trial slots, and the chosen time shows in the summary.
    await pickTrialSlot(page, '09:00');
    await expect.poll(() => mock.sent('GET', `/tutoring/tutors/${TUTOR_SLUG}/slots`).some((request) => request.query['trial'] === 'true')).toBe(true);
    const panel = page.locator('app-tutor-booking-panel');
    await expect(panel).toContainText('09:00-09:30');
    await expect(panel.getByText(th('tutoring.public.profile.booking.free'), { exact: true }).first()).toBeVisible();

    const continueLink = panel.getByRole('link', { name: th('tutoring.public.profile.booking.continue') });
    await expect(continueLink).toHaveAttribute('href', new RegExp(`offeringId=${OFFERING_ID}.*trial=true`));
    await continueLink.click();

    // 3. The booking page: nothing can be reserved until a learner is chosen; the cancellation policy of the server is shown.
    await expect(page).toHaveURL(new RegExp(`/tutors/${TUTOR_SLUG}/book\\?`));
    const reserve = page.getByRole('button', { name: th('tutoring.booking.reserveFree') });
    const summary = page.getByRole('complementary', { name: th('tutoring.booking.summaryHeading') });
    await expect(summary).toContainText('09:00-09:30');
    await expect(reserve).toBeDisabled();
    await expect(page.getByText(th('tutoring.booking.reserveHint'))).toBeVisible();
    await expect(page.getByText(th('tutoring.booking.policyNote', { hours: 24, fullPercent: 100, latePercent: 50 }))).toBeVisible();

    await page.getByRole('combobox', { name: th('tutoring.booking.learner') }).selectOption({ value: LEARNER_PROFILE_MINOR_ID });
    await expect(reserve).toBeEnabled();
    await expect(summary).toContainText('น้องฟ้า');
    await reserve.click();

    // 4. Checkout: a free trial arrives already confirmed.
    await expect(page).toHaveURL(/\/tutoring\/checkout\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: th('tutoring.checkout.confirmed.heading') })).toBeVisible();
    await expect(page.getByText(th('tutoring.checkout.confirmed.freeBody'))).toBeVisible();

    // What left the browser is what the C# `CreateBookingRequest` expects, with the learner and the time the person chose.
    const bookings = mock.sent('POST', '/tutoring/bookings');
    expect(bookings).toHaveLength(1);
    expect(bookings[0].body).toEqual({
      offeringId: OFFERING_ID,
      startsAtUtc: startOnOpenDay('09:00'),
      durationMinutes: 30,
      format: 'OneOnOne',
      learnerProfileId: LEARNER_PROFILE_MINOR_ID,
      isTrial: true,
    });
    const booking = mock.createdBookings[0];
    expect(booking.status).toBe('Confirmed');
    await expect(page).toHaveURL(new RegExp(`/tutoring/checkout/${booking.bookingId}$`));

    // 5. My tutoring lists it. The room is not open yet, so there is a countdown and no join link.
    await page.getByRole('link', { name: th('tutoring.checkout.actions.myTutoring') }).click();
    await expect(page).toHaveURL('/my-tutoring');
    await expect(page.getByRole('heading', { name: 'สถิติและความน่าจะเป็น' })).toBeVisible();
    await expect(page.getByText(th('tutoring.learner.my.card.joinOpensIn'))).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(th('tutoring.learner.my.card.join')) })).toHaveCount(0);

    // 6. The class is about to start: the page offers the join link, and clicking it asks the server for the room.
    mock.openJoinWindow();
    await page.reload();
    const join = page.getByRole('link', { name: new RegExp(th('tutoring.learner.my.card.join')) });
    await expect(join).toBeVisible();
    await join.click();

    await expect(page).toHaveURL(`/tutoring/sessions/${booking.sessionId}/join`);
    await expect(page.getByRole('heading', { name: th('tutoring.join.ready.heading') })).toBeVisible();
    expect(mock.sent('POST', `/tutoring/sessions/${booking.sessionId}/join`)).toHaveLength(1);
    await expect(page.getByRole('link', { name: new RegExp(th('tutoring.join.ready.openRoom')) })).toHaveAttribute('href', MEET_URL);
    // The page also tries to open the room in a new tab; the test keeps that tab off the internet and sees where it went.
    await expect.poll(() => mock.external).toContain(MEET_URL);
  });
});

// ===================================================================================================================================
// Flow B - the tutor sets availability, a learner books it, the tutor sees the class
// ===================================================================================================================================

test.describe('Tutor Marketplace - Flow B: a tutor sets availability and then gets booked', () => {
  test('saved hours become bookable times; once a learner books one, the class is on the tutor\'s list and the time leaves the preview', async ({ harness }) => {
    const { mock } = harness;
    const tutor = await harness.pageFor('Instructor');

    // 1. A tutor with no hours yet: every weekday is closed and learners can see no time.
    await tutor.goto('/instructor/tutoring/availability');
    await expect(tutor.getByRole('heading', { level: 1 })).toHaveText(th('tutoring.tutor.availability.heading'));
    const preview = tutor.locator('app-availability-preview');
    await expect(preview.getByRole('heading', { name: th('tutoring.slots.emptyHeading') })).toBeVisible();

    // 2. Open the hours of OPEN_DAY (09:00-12:00 is the editor's starting window) and save them.
    const dayName = th(`tutoring.enums.weekday.${OPEN_DAY.dayOfWeek}`);
    const dayCard = tutor.locator('app-weekly-rules-editor li').filter({ has: tutor.getByRole('heading', { name: dayName, exact: true }) });
    await dayCard.getByRole('button', { name: new RegExp(th('tutoring.tutor.availability.rules.add')) }).click();
    await expect(tutor.locator('app-weekly-rules-editor')).toContainText(th('tutoring.tutor.availability.unsaved'));
    await tutor.getByRole('button', { name: th('tutoring.tutor.availability.rules.save') }).click();

    const rulesEditor = tutor.locator('app-weekly-rules-editor');
    await expect(rulesEditor).toContainText(th('tutoring.tutor.availability.allSaved'));
    const saved = mock.sent('PUT', '/tutoring/tutor/availability/rules');
    expect(saved).toHaveLength(1);
    expect(saved[0].body).toEqual({ rules: [{ dayOfWeek: OPEN_DAY.dayOfWeek, startLocal: '09:00', endLocal: '12:00' }] });
    expect(mock.weeklyRules).toEqual([{ dayOfWeek: OPEN_DAY.dayOfWeek, startLocal: '09:00', endLocal: '12:00' }]);

    // The preview ("what learners will see") now offers times on that day, built by the server from the saved hours.
    for (const time of ['09:00', '09:30', '10:00', '10:30', '11:00']) {
      await expect(slotButton(preview, time)).toBeVisible();
    }

    // 3. A learner (another person, another browser) books the free trial at 10:00 on that day.
    const learner = await harness.pageFor('Learner');
    await learner.goto(`/tutors/${TUTOR_SLUG}`);
    await expect(learner.getByRole('heading', { level: 1 })).toContainText('สมชาย รุ่งเรืองกิจ');
    await pickTrialSlot(learner, '10:00');
    await learner.locator('app-tutor-booking-panel').getByRole('link', { name: th('tutoring.public.profile.booking.continue') }).click();
    await reserveFreeTrialFor(learner, LEARNER_PROFILE_ADULT_ID);
    await expect(learner.getByRole('heading', { name: th('tutoring.checkout.confirmed.heading') })).toBeVisible();
    expect(mock.sent('POST', '/tutoring/bookings')).toHaveLength(1);

    // 4. The tutor's class list has it: the learner, the trial badge and the time.
    await tutor.getByRole('link', { name: th('tutoring.tutor.nav.classes') }).first().click();
    await expect(tutor).toHaveURL('/instructor/tutoring/classes');
    const classCard = tutor.locator('app-tutor-class-card');
    await expect(classCard).toHaveCount(1);
    await expect(classCard).toContainText('พี่กล้า');
    await expect(classCard).toContainText('10:00');
    await expect(classCard).toContainText(th('tutoring.tutor.classes.card.trial'));

    // 5. Back on the availability page, the booked time is no longer offered (09:30 and 10:00 would overlap it; 09:00 and 10:30 do not).
    await tutor.getByRole('link', { name: th('tutoring.tutor.nav.availability') }).first().click();
    const refreshed = tutor.locator('app-availability-preview');
    await expect(slotButton(refreshed, '09:00')).toBeVisible();
    await expect(slotButton(refreshed, '10:30')).toBeVisible();
    await expect(slotButton(refreshed, '09:30')).toHaveCount(0);
    await expect(slotButton(refreshed, '10:00')).toHaveCount(0);
  });
});

// ===================================================================================================================================
// Flow C - an admin approves a KYC case
// ===================================================================================================================================

test.describe('Tutor Marketplace - Flow C: an admin approves a KYC case', () => {
  test('approval needs a verdict on the document; the decision request carries it and the page shows the case as approved', async ({ harness }) => {
    const { mock } = harness;
    const page = await harness.pageFor('Admin');

    // 1. The queue lists the waiting case; open it.
    await page.goto('/admin/tutoring/kyc');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(th('tutoring.admin.kyc.heading'));
    await page.getByRole('link', { name: /สมชาย รุ่งเรืองกิจ/ }).click();
    await expect(page).toHaveURL(`/admin/tutoring/kyc/${KYC_CASE_ID}`);
    const summary = page.locator('app-kyc-case-summary');
    await expect(summary).toContainText('สมชาย รุ่งเรืองกิจ');
    await expect(summary).toContainText(th('tutoring.enums.kycCaseStatus.Submitted'));

    // 2. Approving without judging the document is refused by the page itself - nothing is sent.
    await page.getByRole('radio', { name: new RegExp(`^${th('tutoring.admin.kyc.decision.option.Approve')}`) }).check();
    await expect(page.getByText(th('tutoring.admin.kyc.decision.issue.undecidedDocuments', { count: 1 }))).toBeVisible();
    await expect(page.getByRole('button', { name: th('tutoring.admin.kyc.decision.review') })).toBeDisabled();
    expect(mock.sent('POST', /\/decision$/)).toHaveLength(0);

    // 3. Judge the document, review, confirm.
    await page.locator('app-kyc-document-table').getByText(th('tutoring.admin.kyc.verdict.Approved'), { exact: true }).click();
    await page.getByRole('button', { name: th('tutoring.admin.kyc.decision.review') }).click();
    await page.getByRole('button', { name: th('tutoring.admin.kyc.decision.confirm.Approve') }).click();

    // 4. The request, and what the person then sees.
    await expect(page.locator('app-kyc-case-summary')).toContainText(th('tutoring.enums.kycCaseStatus.Approved'));
    await expect(page.locator('app-kyc-decision-panel')).toContainText(th('tutoring.admin.kyc.decision.notDecidable'));
    const decisions = mock.sent('POST', `/tutoring/admin/kyc/cases/${KYC_CASE_ID}/decision`);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].body).toEqual({
      decision: 'Approve',
      note: null,
      documents: [{ documentId: KYC_DOCUMENT_ID, status: 'Approved' }],
      rowVersion: 'BBBBBBBBB9E=',
    });

    // 5. Back in the queue the case has left the waiting list and is found under "Approved".
    await page.getByRole('link', { name: th('tutoring.admin.kyc.backToQueue') }).click();
    await expect(page).toHaveURL('/admin/tutoring/kyc');
    await expect(page.getByRole('link', { name: /สมชาย รุ่งเรืองกิจ/ })).toHaveCount(0);
    await page.getByRole('button', { name: th('tutoring.enums.kycCaseStatus.Approved'), exact: true }).click();
    await expect(page.getByRole('link', { name: /สมชาย รุ่งเรืองกิจ/ })).toBeVisible();
  });
});
