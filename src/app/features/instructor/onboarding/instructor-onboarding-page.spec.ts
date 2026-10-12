import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { PayoutPolicy } from '../../payout/data/payout-api.models';
import { InstructorApplicationStatus } from '../data/instructor-profile-api.models';
import { InstructorOnboardingPage } from './instructor-onboarding-page';

registerLocaleData(localeTh);

// Deliberately NOT the old hardcoded 70 / 3 / 500 / 14 so a stray literal can never pass as a server value.
const POLICY: PayoutPolicy = {
  revenueSharePercent: 80,
  platformSharePercent: 20,
  withholdingTaxPercent: 5,
  minimumPayoutAmount: 750,
  holdDays: 21,
};

const OLD_POLICY_LITERALS = ['ทุกวันที่ 1', '1 และ 16', 'วันที่ 5', 'สิ้นเดือน', '70%', '70/30'];

describe('InstructorOnboardingPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/onboarding', component: InstructorOnboardingPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  function root(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  /** Opens the page as an applicant with no profile yet (`GET .../instructors/me` → 404). */
  async function openAsApplicant(): Promise<void> {
    await harness.navigateByUrl('/instructor/onboarding', InstructorOnboardingPage);
    await settle();
    httpMock
      .expectOne('/api/catalog/instructors/me')
      .flush({ title: 'Not found' }, { status: 404, statusText: 'Not Found' });
    await settle();
  }

  function fill(selector: string, value: string): void {
    const el = root().querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  function findButtonByText(text: string): HTMLButtonElement | undefined {
    return Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  }

  /** Fills the profile step and moves on to the terms step (the application only has these two steps now). */
  async function goToTermsStep(): Promise<void> {
    fill('#displayName', 'Test Instructor');
    fill('#bio', 'Test bio');
    findButtonByText(TestBed.inject(TranslationService).locale() === 'th' ? 'ถัดไป' : 'Next')?.click();
    await settle();
  }

  async function agreeAndSubmit(): Promise<void> {
    const agree = root().querySelector('input[type="checkbox"]') as HTMLInputElement;
    agree.checked = true;
    agree.dispatchEvent(new Event('change'));
    await settle();
    findButtonByText('Submit instructor application')?.click();
    await settle();
  }

  async function flushPolicy(response: PayoutPolicy = POLICY, status = 200): Promise<void> {
    const req = httpMock.expectOne('/api/payout/policy');
    expect(req.request.method).toBe('GET');
    if (status === 200) {
      req.flush(response);
    } else {
      req.flush({ title: 'Server Error' }, { status, statusText: 'Error' });
    }
    await settle();
  }

  it('submits only the application through the instructor profile API and never calls the payout-account endpoint', async () => {
    await openAsApplicant();
    fill('#displayName', '  Somchai  ');
    fill('#headline', '');
    fill('#bio', ' My bio ');
    findButtonByText('Next')?.click();
    await settle();
    await flushPolicy();
    await agreeAndSubmit();

    const apply = httpMock.expectOne('/api/catalog/instructors/apply');
    expect(apply.request.method).toBe('POST');
    expect(apply.request.body).toEqual({ displayName: 'Somchai', headline: null, bio: 'My bio' });
    apply.flush({
      id: 'p1',
      userId: 'u1',
      displayName: 'Somchai',
      headline: null,
      bio: 'My bio',
      revenueSharePercent: 70,
      status: 'Pending',
      approvedAtUtc: null,
    });
    await settle();

    // An applicant is not an approved instructor yet, so the payout endpoint would answer 403 — it must not be called.
    httpMock.expectNone((r) => r.url.includes('/api/payout/instructor/payout-account'));
    expect(root().textContent).toContain('Your application is under review');
  });

  it('has two steps (profile, terms) and no bank-account fields anywhere in the application flow', async () => {
    await openAsApplicant();
    for (const id of ['#bankName', '#accountNumber', '#accountHolder', '#promptpay']) {
      expect(root().querySelector(id)).toBeNull();
    }

    await goToTermsStep();
    await flushPolicy();

    expect(root().textContent).toContain('Step 2: Revenue-share terms and agreement');
    for (const id of ['#bankName', '#accountNumber', '#accountHolder', '#promptpay']) {
      expect(root().querySelector(id)).toBeNull();
    }
    expect(findButtonByText('Submit instructor application')).toBeDefined();
    expect(findButtonByText('Next')).toBeUndefined();
  });

  it('tells the applicant the bank account is added after approval on the earnings page, without claiming a payout schedule', async () => {
    await openAsApplicant();
    await goToTermsStep();
    await flushPolicy();

    const text = root().textContent ?? '';
    expect(text).toContain("You don't need to enter a bank account to apply");
    expect(text).toContain('"Earnings" page in Studio');
  });

  it('shows the server message and stays on the form when the application is rejected', async () => {
    await openAsApplicant();
    await goToTermsStep();
    await flushPolicy();
    await agreeAndSubmit();

    httpMock
      .expectOne('/api/catalog/instructors/apply')
      .flush({ detail: 'already applied' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(root().textContent).toContain('already applied');
    expect(findButtonByText('Submit instructor application')).toBeDefined();
  });

  it('does not fetch the policy (or show any policy copy) on step 1', async () => {
    await openAsApplicant();

    // httpMock.verify() in afterEach would fail if a policy request had been issued.
    expect(root().textContent).not.toContain('hold period');
  });

  it('renders the server numbers on the terms step with a single policy fetch (English)', async () => {
    await openAsApplicant();
    await goToTermsStep();
    await flushPolicy();

    const text = root().textContent ?? '';
    expect(text).toContain('Standard instructor revenue share: 80%');
    expect(text).toContain('1. Instructors receive 80% and the platform receives 20% of course sales');
    expect(text).toContain('2. Regular payouts are subject to 5% withholding tax');
    for (const literal of OLD_POLICY_LITERALS) {
      expect(text).not.toContain(literal);
    }
  });

  it('renders the server numbers in Thai and states no payout date or cycle', async () => {
    TestBed.inject(TranslationService).setLocale('th');
    await openAsApplicant();
    await goToTermsStep();
    await flushPolicy();

    const text = root().textContent ?? '';
    expect(text).toContain('ส่วนแบ่งรายได้มาตรฐาน 80% สำหรับผู้สอน');
    expect(text).toContain('1. ผู้สอนจะได้รับส่วนแบ่งรายได้ 80% และแพลตฟอร์มได้รับ 20%');
    expect(text).toContain('หักภาษี ณ ที่จ่าย 5%');
    expect(text).toContain('ขั้นตอนที่ 2: เงื่อนไขและข้อตกลงส่วนแบ่งรายได้');
    for (const literal of OLD_POLICY_LITERALS) {
      expect(text).not.toContain(literal);
    }
  });

  it('shows a skeleton, never a number, while the policy is loading', async () => {
    await openAsApplicant();
    await goToTermsStep();

    const text = root().textContent ?? '';
    expect(text).not.toContain('฿');
    expect(text).not.toContain('70%');
    expect(text).not.toContain('80%');
    expect(root().querySelector('app-payout-policy-text[aria-busy="true"]')).not.toBeNull();

    await flushPolicy();
    expect(root().textContent).toContain('Standard instructor revenue share: 80%');
    expect(root().querySelector('app-payout-policy-text[aria-busy="true"]')).toBeNull();
  });

  describe('what an applicant sees depending on the admin\'s decision', () => {
    function existingProfile(status: InstructorApplicationStatus) {
      return {
        id: 'p1',
        userId: 'u1',
        displayName: 'Somchai Original',
        headline: 'Cloud architect',
        bio: 'Original bio',
        revenueSharePercent: 70,
        status,
        approvedAtUtc: status === 'Approved' ? '2026-10-01T00:00:00Z' : null,
      };
    }

    async function openWithProfile(status: InstructorApplicationStatus): Promise<void> {
      await harness.navigateByUrl('/instructor/onboarding', InstructorOnboardingPage);
      await settle();
      httpMock.expectOne('/api/catalog/instructors/me').flush(existingProfile(status));
      await settle();
      await settle();
    }

    it('shows only a spinner — not the empty form — while the application status is loading', async () => {
      await harness.navigateByUrl('/instructor/onboarding', InstructorOnboardingPage);
      await settle();

      expect(root().querySelector('app-spinner')).not.toBeNull();
      expect(root().querySelector('#displayName')).toBeNull();

      httpMock.expectOne('/api/catalog/instructors/me').flush({ title: 'Not found' }, { status: 404, statusText: 'Not Found' });
      await settle();
      expect(root().querySelector('#displayName')).not.toBeNull();
    });

    it('shows "waiting for review" and no application form while the application is pending', async () => {
      await openWithProfile('Pending');

      expect(root().textContent).toContain('Your application is under review');
      expect(root().querySelector('#displayName')).toBeNull();
      expect(findButtonByText('Submit instructor application')).toBeUndefined();
    });

    it('shows the way into the studio only once the application is approved', async () => {
      await openWithProfile('Approved');

      expect(root().textContent).toContain('You are now a SIRI UpSkill instructor');
      expect(root().querySelector('a[href="/instructor"]')).not.toBeNull();
      expect(root().querySelector('#displayName')).toBeNull();
    });

    it('tells a rejected applicant so, keeps the form prefilled, and lets them apply again', async () => {
      await openWithProfile('Rejected');

      expect(root().textContent).toContain('Your previous application was not approved');
      expect((root().querySelector('#displayName') as HTMLInputElement).value).toBe('Somchai Original');
      expect((root().querySelector('#bio') as HTMLTextAreaElement).value).toBe('Original bio');

      fill('#bio', 'Updated bio');
      findButtonByText('Next')?.click();
      await settle();
      await flushPolicy();
      await agreeAndSubmit();

      const apply = httpMock.expectOne('/api/catalog/instructors/apply');
      expect(apply.request.body).toEqual({ displayName: 'Somchai Original', headline: 'Cloud architect', bio: 'Updated bio' });
      apply.flush(existingProfile('Pending'));
      await settle();

      expect(root().textContent).toContain('Your application is under review');
      expect(root().textContent).not.toContain('Your previous application was not approved');
    });

    it('does not show the empty form when the status lookup fails (not a 404), and retry loads it again', async () => {
      await harness.navigateByUrl('/instructor/onboarding', InstructorOnboardingPage);
      await settle();
      httpMock.expectOne('/api/catalog/instructors/me').flush({ title: 'Server Error' }, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(root().textContent).toContain("Couldn't check your application");
      expect(root().querySelector('#displayName')).toBeNull();

      findButtonByText('Try again')?.click();
      await settle();
      httpMock.expectOne('/api/catalog/instructors/me').flush(existingProfile('Pending'));
      await settle();

      expect(root().textContent).toContain('Your application is under review');
      expect(root().textContent).not.toContain("Couldn't check your application");
    });
  });

  it('shows "—" instead of any number when the policy request fails, offers one retry, and retry restores real values', async () => {
    await openAsApplicant();
    await goToTermsStep();
    await flushPolicy(POLICY, 500);

    let text = root().textContent ?? '';
    expect(text).toContain('Standard instructor revenue share: —');
    expect(text).toContain('1. Instructors receive — and the platform receives —');
    expect(text).not.toContain('80%');
    for (const literal of OLD_POLICY_LITERALS) {
      expect(text).not.toContain(literal);
    }

    // Only the terms heading carries the retry affordance; the two repeats are not retryable.
    const retryLabel = "Couldn't load the policy figures — try again";
    const retryButtons = Array.from(root().querySelectorAll('button')).filter((b) => b.textContent?.trim() === retryLabel);
    expect(retryButtons.length).toBe(1);
    retryButtons[0].click();
    await settle();
    await flushPolicy();

    text = root().textContent ?? '';
    expect(text).toContain('Standard instructor revenue share: 80%');
    expect(findButtonByText(retryLabel)).toBeUndefined();
  });
});
