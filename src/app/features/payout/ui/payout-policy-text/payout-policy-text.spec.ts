import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../core/i18n/translation.service';
import { PayoutPolicy } from '../../data/payout-api.models';
import { PayoutPolicyStore } from '../../data/payout-policy.store';
import { PayoutPolicyText } from './payout-policy-text';

registerLocaleData(localeTh);

const POLICY: PayoutPolicy = {
  revenueSharePercent: 33.5,
  platformSharePercent: 66.5,
  withholdingTaxPercent: 5,
  minimumPayoutAmount: 1234.5,
  holdDays: 9,
};

describe('PayoutPolicyText', () => {
  let fixture: ComponentFixture<PayoutPolicyText>;
  let httpMock: HttpTestingController;

  async function settle(): Promise<void> {
    TestBed.flushEffects();
    await Promise.resolve();
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [PayoutPolicyStore, provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PayoutPolicyText);
    fixture.componentRef.setInput('messageKey', 'instructor.earnings.policyIntro');
    await settle();
  });

  afterEach(() => httpMock.verify());

  it('formats whole-number percents, THB money and day counts from the server values', async () => {
    httpMock.expectOne('/api/payout/policy').flush(POLICY);
    await settle();

    expect(el().textContent).toContain('Your revenue share is 33.5%');
    expect(el().textContent).toContain('hold period of 9 days');
    expect(el().textContent).toContain('reaches ฿1,234.50');
    expect(el().getAttribute('aria-busy')).toBeNull();
  });

  it('re-renders in the other language when the locale is toggled, without a refetch', async () => {
    httpMock.expectOne('/api/payout/policy').flush(POLICY);
    await settle();
    expect(el().textContent).toContain('Your revenue share is 33.5%');

    TestBed.inject(TranslationService).setLocale('th');
    await settle();

    expect(el().textContent).toContain('ส่วนแบ่งรายได้ 33.5% ให้กับผู้สอน');
    expect(el().textContent).toContain('hold 9 วัน');
  });

  it('is busy with a skeleton (no number) in sentence mode while loading', () => {
    expect(el().getAttribute('aria-busy')).toBe('true');
    expect(el().querySelector('app-skeleton')).not.toBeNull();
    expect(el().textContent).not.toMatch(/\d/);

    httpMock.expectOne('/api/payout/policy').flush(POLICY);
  });

  it('shows "—" placeholders instead of a skeleton in inline mode while loading', async () => {
    fixture.componentRef.setInput('inline', true);
    await settle();

    expect(el().querySelector('app-skeleton')).toBeNull();
    expect(el().textContent).toContain('Your revenue share is —');
    expect(el().textContent).not.toMatch(/\d/);

    httpMock.expectOne('/api/payout/policy').flush(POLICY);
  });

  it('shows "—" and a retry button on error, and no retry button when not retryable', async () => {
    httpMock.expectOne('/api/payout/policy').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    await settle();

    expect(el().textContent).toContain('Your revenue share is —');
    expect(el().textContent).not.toMatch(/\d/);
    expect(el().querySelector('button')).not.toBeNull();

    fixture.componentRef.setInput('retryable', false);
    await settle();
    expect(el().querySelector('button')).toBeNull();
  });
});
