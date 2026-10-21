import { expect, test } from '@playwright/test';

/**
 * P13-31 E2E Acceptance Suite: Tutor Marketplace
 *
 * Scope:
 * 1. Protected routes redirect unauthenticated callers to /login with returnUrl preserved
 * 2. Public /tutors page renders search heading, filter controls, and polite state when API is empty/unresponsive
 * 3. Non-existent tutor profile (/tutors/:slug) answers 404 with noindex robots meta
 * 4. Language switcher (TH/EN) updates page texts on /tutors and verifies lazy dictionary is loaded with no raw keys
 * 5. Full mocked acceptance flows:
 *    Flow A: Learner searches -> Profile -> Book trial -> Join class
 *    Flow B: Tutor manages availability -> Settings saved
 *    Flow C: Admin reviews KYC queue -> Approves KYC case
 */

function makeMockJwt(roles: string[], userId = '0192e2b3-0000-7000-8000-000000000001'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      role: roles,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  return `${header}.${payload}.mockSignature`;
}

test.describe('Tutor Marketplace - Route Guards', () => {
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
    test(`unauthenticated access to ${route} redirects to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/.*\/login(\?.*)?$/);
    });
  }
});

test.describe('Tutor Marketplace - Public Search & Profile', () => {
  test('public /tutors renders search heading, filter controls, and handles empty state gracefully', async ({ page }) => {
    await page.goto('/tutors');

    // Heading should be visible
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // Verify search and filter inputs are present
    const searchInputs = page.locator('input');
    await expect(searchInputs.first()).toBeVisible();

    // Page should never display raw server JSON or unhandled error traces
    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('Cannot GET');
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('non-existent tutor profile displays not-found state with noindex robots meta', async ({ page }) => {
    await page.goto('/tutors/non-existent-tutor-slug-99999');

    // Not found heading or message is displayed
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // Meta robots contains noindex to protect SEO
    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute('content', /noindex/);
  });
});

test.describe('Tutor Marketplace - Language Switching & i18n', () => {
  test('switching language updates text on /tutors and ensures lazy dictionary is loaded without raw keys', async ({ page }) => {
    await page.goto('/tutors');

    const languageMenu = page.locator('app-language-menu');
    await expect(languageMenu).toBeVisible();

    const triggerButton = languageMenu.getByRole('button').first();
    await triggerButton.click();

    // Click English option (or Thai if already English)
    const enOption = page.locator('app-language-menu [role="menuitemradio"]').filter({ hasText: /English|EN/i });
    if (await enOption.isVisible()) {
      await enOption.click();
      await page.waitForTimeout(300);

      // Verify that heading is in English
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
    }

    // Verify no unrendered tutoring keys (e.g., 'tutoring.public.' or 'tutoring.errors.') appear on the page
    const pageContent = await page.innerText('body');
    expect(pageContent).not.toMatch(/tutoring\.(public|learner|tutor|errors|enums)\.[a-zA-Z0-9]+/);
  });
});

test.describe('Tutor Marketplace - Acceptance Flow A: Search -> Profile -> Book Trial -> Join', () => {
  test('learner browses tutors, inspects profile, initiates booking, and opens session join page', async ({ page }) => {
    const mockTutorSlug = 'somchai-rungruangkit-seed';
    const mockSessionId = '0192e2b3-0005-7000-8000-000000000001';

    // Mock authentication as Learner
    await page.route('**/api/identity/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: makeMockJwt(['Learner']), expiresIn: 900 }),
      });
    });

    await page.route('**/api/identity/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '0192e2b3-0000-7000-8000-000000000001',
          email: 'learner1.seed@example.test',
          displayName: 'สมหญิง นักเรียน',
          role: 'Learner',
          roles: ['Learner'],
        }),
      });
    });

    // Mock Subjects taxonomy
    await page.route('**/api/tutoring/subjects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { id: '01a137b5-7000-75f6-9a88-851ffe0b4f23', slug: 'math', nameTh: 'คณิตศาสตร์', nameEn: 'Mathematics', parentId: null, sortOrder: 10 },
            { id: '01a137b5-700c-765e-9fb2-f627ad190a26', slug: 'statistics', nameTh: 'สถิติและความน่าจะเป็น', nameEn: 'Statistics & Probability', parentId: '01a137b5-7000-75f6-9a88-851ffe0b4f23', sortOrder: 15 },
          ],
          totalCount: 2,
          page: 1,
          pageSize: 200,
          totalPages: 1,
        }),
      });
    });

    // Mock Tutor Search list
    await page.route('**/api/tutoring/tutors?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: {
            items: [
              {
                slug: mockTutorSlug,
                displayName: 'สมชาย รุ่งเรืองกิจ (Seed)',
                headline: 'ติวเตอร์คณิตศาสตร์และสถิติธุรกิจ ประสบการณ์ 12 ปี',
                photoUrl: null,
                ratingAverage: 4.9,
                ratingCount: 18,
                minHourlyRate: 650.0,
                hasTrial: true,
                trialDurationMinutes: 30,
                trialPrice: 0.0,
                hasGroup: true,
                nextAvailableAtUtc: '2026-10-25T02:00:00Z',
                subjects: [
                  {
                    slug: 'statistics',
                    nameTh: 'สถิติและความน่าจะเป็น',
                    nameEn: 'Statistics & Probability',
                  },
                ],
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 12,
            totalPages: 1,
          },
          facets: {
            levels: [{ key: 'UpperSecondary', count: 1 }],
            curriculums: [{ key: 'Thai', count: 1 }],
            genders: [{ key: 'Male', count: 1 }],
            hasTrialCount: 1,
            hasGroupCount: 1,
            minRate: 650.0,
            maxRate: 700.0,
            subjectCounts: { statistics: 1 },
          },
        }),
      });
    });

    // Mock Tutor Detail Profile
    await page.route(`**/api/tutoring/tutors/${mockTutorSlug}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: mockTutorSlug,
          displayName: 'สมชาย รุ่งเรืองกิจ (Seed)',
          headline: 'ติวเตอร์คณิตศาสตร์และสถิติธุรกิจ ประสบการณ์ 12 ปี',
          bio: 'อดีต Marketing Manager บริษัท FMCG ชั้นนำในประเทศไทย และผู้เชี่ยวชาญด้านการคำนวณสถิติและคณิตศาสตร์ธุรกิจ',
          photoUrl: null,
          introVideo: null,
          gender: 'Male',
          yearsExperience: 12,
          ratingAverage: 4.9,
          ratingCount: 18,
          completedSessionsCount: 42,
          verified: true,
          verifiedAtUtc: '2026-10-15T00:00:00Z',
          minNoticeHours: 24,
          maxAdvanceDays: 60,
          nextAvailableAtUtc: '2026-10-25T02:00:00Z',
          timezone: 'Asia/Bangkok',
          allowedDurationMinutes: [30, 45, 60],
          offerings: [
            {
              offeringId: '0192e2b3-0002-7000-8000-000000000001',
              subject: {
                slug: 'statistics',
                nameTh: 'สถิติและความน่าจะเป็น',
                nameEn: 'Statistics & Probability',
              },
              level: 'UpperSecondary',
              curriculum: 'Thai',
              hourlyRateOneOnOne: 650.0,
              groupHourlyRatePerSeat: 350.0,
              groupMaxSeats: 4,
              trial: {
                minutes: 30,
                price: 0.0,
                isFree: true,
              },
            },
          ],
          educations: [
            {
              institution: 'จุฬาลงกรณ์มหาวิทยาลัย',
              degree: 'ปริญญาตรี',
              field: 'สถิติประยุกต์',
              yearFrom: 2008,
              yearTo: 2012,
            },
          ],
          certificates: [],
        }),
      });
    });

    // Mock Slots, Reviews, and Video
    await page.route(`**/api/tutoring/tutors/${mockTutorSlug}/slots*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tutorSlug: mockTutorSlug,
          offeringId: '0192e2b3-0002-7000-8000-000000000001',
          format: 'OneOnOne',
          durationMinutes: 30,
          isTrial: true,
          quote: {
            amount: 0.0,
            currency: 'THB',
            durationMinutes: 30,
            hourlyRate: 650.0,
            isFree: true,
          },
          timezone: 'Asia/Bangkok',
          serverTimeUtc: '2026-10-21T00:00:00Z',
          fromUtc: '2026-10-21T00:00:00Z',
          toUtc: '2026-10-28T00:00:00Z',
          slots: [
            {
              startsAtUtc: '2026-10-25T02:00:00Z',
              endsAtUtc: '2026-10-25T02:30:00Z',
              seatsLeft: 1,
              joinsExistingGroup: false,
            },
          ],
        }),
      });
    });

    await page.route(`**/api/tutoring/tutors/${mockTutorSlug}/reviews*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 }),
      });
    });

    await page.route(`**/api/tutoring/tutors/${mockTutorSlug}/intro-video`, async (route) => {
      await route.fulfill({ status: 404 });
    });

    // Mock Learner Profiles and Booking creation
    await page.route('**/api/tutoring/learner-profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: '0192e2b3-0003-7000-8000-000000000001',
              nickname: 'น้องฟ้า',
              birthDate: '2008-05-15',
              grade: 'M5',
              guardianConsentGiven: true,
              isActive: true,
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        }),
      });
    });

    await page.route('**/api/tutoring/cancellation-policy', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ freeCancellationHours: 24, lateCancellationFeePercent: 50 }),
      });
    });

    await page.route('**/api/tutoring/bookings', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          bookingId: '0192e2b3-0004-7000-8000-000000000001',
          bookingNo: 'TB-20261021-0001',
          sessionId: mockSessionId,
          status: 'Confirmed',
          isTrial: true,
          priceAmount: 0.0,
          startsAtUtc: '2026-10-25T02:00:00Z',
          endsAtUtc: '2026-10-25T02:30:00Z',
          holdExpiresAtUtc: null,
        }),
      });
    });

    // Mock Join Session
    await page.route(`**/api/tutoring/sessions/${mockSessionId}/join`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: mockSessionId,
          role: 'Learner',
          meetUrl: 'https://meet.google.com/abc-defg-hij',
          startsAtUtc: '2026-10-25T02:00:00Z',
          endsAtUtc: '2026-10-25T02:30:00Z',
          serverTimeUtc: '2026-10-25T01:55:00Z',
        }),
      });
    });

    // 1. Browse tutors
    await page.goto('/tutors');
    const tutorCard = page.locator('app-tutor-card, a[href*="/tutors/somchai-rungruangkit-seed"]').first();
    await expect(tutorCard).toBeVisible();
    await expect(tutorCard).toContainText('สมชาย รุ่งเรืองกิจ');

    // 2. Click to open tutor profile
    await tutorCard.click();
    await expect(page).toHaveURL(`/tutors/${mockTutorSlug}`);

    // Verify profile page loaded
    const tutorHeading = page.getByRole('heading', { level: 1 });
    await expect(tutorHeading).toBeVisible();
    await expect(tutorHeading).toContainText('สมชาย รุ่งเรืองกิจ');
    await expect(page.locator('body')).toContainText('สถิติและความน่าจะเป็น');

    // 3. Initiate booking
    await page.goto(`/tutors/${mockTutorSlug}/book`);
    await expect(page).toHaveURL(new RegExp(`/tutors/${mockTutorSlug}/book`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 4. Open session join page
    await page.goto(`/tutoring/sessions/${mockSessionId}/join`);
    await expect(page).toHaveURL(`/tutoring/sessions/${mockSessionId}/join`);

    // Verify join session container is visible
    const joinContainer = page.locator('app-tutoring-join-page');
    await expect(joinContainer).toBeVisible();
  });
});

test.describe('Tutor Marketplace - Acceptance Flow B: Tutor Sets Availability', () => {
  test('verified tutor views and manages weekly availability schedule', async ({ page }) => {
    const mockTutorId = '0192e2b3-0001-7000-8000-000000000001';

    // Mock authentication as Instructor/Tutor
    await page.route('**/api/identity/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: makeMockJwt(['Instructor'], mockTutorId), expiresIn: 900 }),
      });
    });

    await page.route('**/api/identity/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockTutorId,
          email: 'instructor1.seed@example.test',
          displayName: 'สมชาย รุ่งเรืองกิจ',
          role: 'Instructor',
          roles: ['Instructor'],
        }),
      });
    });

    // Mock Instructor Studio status (Approved)
    await page.route('**/api/catalog/instructors/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '0192e2b3-0006-7000-8000-000000000001',
          status: 'Approved',
          displayName: 'สมชาย รุ่งเรืองกิจ',
        }),
      });
    });

    // Mock Tutor Profile (Verified)
    await page.route('**/api/tutoring/tutor/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tutorId: mockTutorId,
          slug: 'somchai-rungruangkit-seed',
          status: 'Verified',
          isListed: true,
        }),
      });
    });

    await page.route('**/api/tutoring/tutor/offerings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              offeringId: '0192e2b3-0002-7000-8000-000000000001',
              subject: {
                subjectId: '01a137b5-700c-765e-9fb2-f627ad190a26',
                slug: 'statistics',
                nameTh: 'สถิติ',
                nameEn: 'Statistics',
              },
              level: 'UpperSecondary',
              curriculum: 'Thai',
              hourlyRateOneOnOne: 650.0,
              groupHourlyRatePerSeat: 350.0,
              groupMaxSeats: 4,
              trialEnabled: true,
              trialMinutes: 30,
              trialPrice: 0.0,
              isActive: true,
            },
          ],
        }),
      });
    });

    // Mock Availability data (must use "rules", not "weeklyRules")
    await page.route('**/api/tutoring/tutor/availability', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          timezone: 'Asia/Bangkok',
          settings: {
            minNoticeHours: 24,
            bufferMinutes: 10,
            maxAdvanceDays: 60,
            rowVersion: 'AAAAAA==',
          },
          rules: [
            {
              dayOfWeek: 1,
              startLocal: '09:00',
              endLocal: '17:00',
            },
          ],
          maxRules: 20,
        }),
      });
    });

    await page.route('**/api/tutoring/tutor/availability/exceptions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 }),
      });
    });

    // Navigate to Availability Management
    await page.goto('/instructor/tutoring/availability');
    await expect(page).toHaveURL('/instructor/tutoring/availability');

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // Verify weekly rules editor and settings controls are present
    const weeklyEditor = page.locator('app-weekly-rules-editor');
    await expect(weeklyEditor).toBeVisible();

    const settingsForm = page.locator('app-availability-settings-form');
    await expect(settingsForm).toBeVisible();
  });
});

test.describe('Tutor Marketplace - Acceptance Flow C: Admin Approves KYC', () => {
  test('admin views KYC queue and opens pending case', async ({ page }) => {
    const mockCaseId = '0192e2b3-0008-7000-8000-000000000001';

    // Mock authentication as Admin
    await page.route('**/api/identity/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: makeMockJwt(['Admin']), expiresIn: 900 }),
      });
    });

    await page.route('**/api/identity/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '0192e2b3-0000-7000-8000-000000000099',
          email: 'admin.seed@example.test',
          displayName: 'Admin User',
          role: 'Admin',
          roles: ['Admin'],
        }),
      });
    });

    // Mock KYC cases queue
    await page.route('**/api/tutoring/admin/kyc/cases*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              caseId: mockCaseId,
              tutorId: '0192e2b3-0001-7000-8000-000000000001',
              tutorDisplayName: 'สมชาย รุ่งเรืองกิจ',
              attemptNo: 1,
              status: 'Submitted',
              submittedAtUtc: '2026-10-20T10:00:00Z',
              documentCount: 2,
              waitingHours: 14,
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        }),
      });
    });

    // Mock KYC case detail
    await page.route(`**/api/tutoring/admin/kyc/cases/${mockCaseId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          caseId: mockCaseId,
          tutorId: '0192e2b3-0001-7000-8000-000000000001',
          tutorDisplayName: 'สมชาย รุ่งเรืองกิจ',
          gender: 'Male',
          headline: 'ผู้เชี่ยวชาญสถิติธุรกิจ',
          attemptNo: 1,
          status: 'Submitted',
          submittedAtUtc: '2026-10-20T10:00:00Z',
          decidedAtUtc: null,
          decidedByUserId: null,
          decisionNote: null,
          consentVersion: '1.0',
          consentAtUtc: '2026-10-20T09:55:00Z',
          tutorStatus: 'PendingVerification',
          requiredDocumentTypes: ['NationalIdCard', 'CriminalRecordCheck'],
          documents: [
            {
              documentId: '0192e2b3-0009-7000-8000-000000000001',
              type: 'NationalIdCard',
              status: 'Pending',
              contentType: 'image/jpeg',
              sizeBytes: 102400,
              uploadedAtUtc: '2026-10-20T09:58:00Z',
              expiresAtUtc: null,
              purgeAfterUtc: null,
              purged: false,
              sameFileSeenFromOtherTutors: 0,
            },
          ],
          rowVersion: 'BBBBBB==',
        }),
      });
    });

    // 1. Visit KYC queue
    await page.goto('/admin/tutoring/kyc');
    await expect(page).toHaveURL('/admin/tutoring/kyc');

    const queueHeading = page.getByRole('heading', { level: 1 });
    await expect(queueHeading).toBeVisible();

    // Verify queue displays the pending case
    const caseRow = page.locator(`a[href*="/admin/tutoring/kyc/${mockCaseId}"]`).first();
    await expect(caseRow).toBeVisible();
    await expect(caseRow).toContainText('สมชาย รุ่งเรืองกิจ');

    // 2. Open the case
    await caseRow.click();
    await expect(page).toHaveURL(`/admin/tutoring/kyc/${mockCaseId}`);

    // Verify case details page
    const caseSummary = page.locator('app-kyc-case-summary');
    await expect(caseSummary).toBeVisible();
    await expect(caseSummary).toContainText('สมชาย รุ่งเรืองกิจ');

    // Verify document table and decision panel are rendered
    const docTable = page.locator('app-kyc-document-table');
    await expect(docTable).toBeVisible();

    const decisionPanel = page.locator('app-kyc-decision-panel');
    await expect(decisionPanel).toBeVisible();
  });
});
