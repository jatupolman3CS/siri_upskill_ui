import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { PayoutPolicy } from '../../payout/data/payout-api.models';
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

  async function goToStep2(): Promise<void> {
    fill('#displayName', 'Test Instructor');
    fill('#bio', 'Test bio');
    findButtonByText('ถัดไป')?.click();
    await settle();
  }

  async function goToStep3(): Promise<void> {
    fill('#accountNumber', '1234567890');
    fill('#accountHolder', 'Test Holder');
    findButtonByText('ถัดไป')?.click();
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

  it('does not fetch the policy (or show any policy copy) on step 1', async () => {
    await openAsApplicant();

    // httpMock.verify() in afterEach would fail if a policy request had been issued.
    expect(root().textContent).not.toContain('hold period');
  });

  it('renders the server numbers on the payout-account and terms steps with a single policy fetch (English)', async () => {
    await openAsApplicant();
    await goToStep2();
    await flushPolicy();

    let text = root().textContent ?? '';
    expect(text).toContain('after the hold period of 21 days and once your accumulated balance reaches ฿750.00');

    await goToStep3();

    text = root().textContent ?? '';
    expect(text).toContain('Standard instructor revenue share: 80%');
    expect(text).toContain('1. Instructors receive 80% and the platform receives 20% of course sales');
    expect(text).toContain('2. Regular payouts are subject to 5% withholding tax');
    for (const literal of OLD_POLICY_LITERALS) {
      expect(text).not.toContain(literal);
    }
    // Moving 2 -> 3 reuses the page-level store: no second request (verified by httpMock.verify()).
  });

  it('renders the server numbers in Thai and states no payout date or cycle', async () => {
    TestBed.inject(TranslationService).setLocale('th');
    await openAsApplicant();
    await goToStep2();
    await flushPolicy();

    let text = root().textContent ?? '';
    expect(text).toContain('เมื่อผู้ดูแลระบบสร้างรอบจ่ายหลังพ้นระยะ hold 21 วัน และยอดสะสมของคุณถึง ฿750.00');

    await goToStep3();

    text = root().textContent ?? '';
    expect(text).toContain('ส่วนแบ่งรายได้มาตรฐาน 80% สำหรับผู้สอน');
    expect(text).toContain('1. ผู้สอนจะได้รับส่วนแบ่งรายได้ 80% และแพลตฟอร์มได้รับ 20%');
    expect(text).toContain('หักภาษี ณ ที่จ่าย 5%');
    for (const literal of OLD_POLICY_LITERALS) {
      expect(text).not.toContain(literal);
    }
  });

  it('shows a skeleton, never a number, while the policy is loading', async () => {
    await openAsApplicant();
    await goToStep2();

    const text = root().textContent ?? '';
    expect(text).not.toContain('21 days');
    expect(text).not.toContain('฿');
    expect(text).not.toContain('70%');
    expect(root().querySelector('app-payout-policy-text[aria-busy="true"]')).not.toBeNull();

    await flushPolicy();
    expect(root().textContent).toContain('hold period of 21 days');
    expect(root().querySelector('app-payout-policy-text[aria-busy="true"]')).toBeNull();
  });

  it('shows "—" instead of any number when the policy request fails, offers one retry, and retry restores real values', async () => {
    await openAsApplicant();
    await goToStep2();
    await flushPolicy(POLICY, 500);

    let text = root().textContent ?? '';
    expect(text).toContain('hold period of — days');
    expect(text).not.toContain('21');

    await goToStep3();

    text = root().textContent ?? '';
    expect(text).toContain('Standard instructor revenue share: —');
    expect(text).toContain('1. Instructors receive — and the platform receives —');
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
