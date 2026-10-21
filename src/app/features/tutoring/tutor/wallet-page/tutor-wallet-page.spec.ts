import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { type Route, ledgerRow, paged, payoutRow, settleWith, wallet } from '../testing/tutor-ops-fixtures';
import { TutorWalletPage } from './tutor-wallet-page';

registerLocaleData(localeTh);

const WALLET_URL = '/api/tutoring/tutor/wallet';

describe('TutorWalletPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring/wallet', component: TutorWalletPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';
  const buttons = (): HTMLButtonElement[] => [...page().querySelectorAll('button')];

  function routes(overrides: readonly Route[] = []): readonly Route[] {
    return [
      ...overrides,
      { url: WALLET_URL, reply: wallet() },
      { url: `${WALLET_URL}/ledger`, reply: paged([ledgerRow()]) },
      { url: `${WALLET_URL}/payouts`, reply: paged([payoutRow()]) },
      { url: '/api/tutoring/cancellation-policy', reply: { fullRefundHours: 24, fullRefundPercent: 100, lateRefundPercent: 50, tutorCancelRefundPercent: 100, tutorNoShowRefundPercent: 100, learnerNoShowRefundPercent: 0, disputeWindowHours: 24 } },
    ];
  }

  async function open(overrides: readonly Route[] = []) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/wallet', TutorWalletPage);
    return settleWith(harness, httpMock, routes(overrides));
  }

  it('shows held, frozen, available, processing and paid exactly as the server sent them', async () => {
    await open();
    for (const amount of ['900.00', '150.00', '1,200.00', '300.00', '4,500.00']) {
      expect(text()).toContain(amount);
    }
    for (const label of ['Held', 'Frozen by a dispute', 'Available', 'In a payout run', 'Paid']) {
      expect(text()).toContain(label);
    }
    expect(text()).toContain('1,164.00');
    expect(text()).toContain('3%');
    expect(text()).toContain('500.00');
    expect(text()).toContain('will go into the next run');
  });

  it('explains the rules in plain language with the server\'s own numbers - the hold period, the commission and the share', async () => {
    await open();
    expect(text()).toContain('24-hour dispute period');
    expect(text()).toContain('20% platform commission');
    expect(text()).toContain('Your share is 80%');
    expect(text()).toContain('Payouts are weekly');
    expect(text()).toContain('estimate');
  });

  it('falls back to a number-free hold note when the policy cannot be read', async () => {
    await open([{ url: '/api/tutoring/cancellation-policy', status: 500, reply: { status: 500 } }]);
    expect(text()).toContain('until the class is over and the dispute period has passed');
    expect(text()).not.toContain('24-hour');
  });

  it('lists the ledger with the fee and commission the server took, and a deduction as a deduction', async () => {
    await open([
      {
        url: `${WALLET_URL}/ledger`,
        reply: paged([
          ledgerRow(),
          ledgerRow({ entryId: 'e-2', bookingNo: null, sessionStartsAtUtc: null, sourceKind: 'PackageExpiry', kind: 'Adjustment', tutorAmount: -120, state: 'Available', availableAtUtc: null }),
        ]),
      },
    ]);
    expect(text()).toContain('Booking TB-1001');
    expect(text()).toContain('16.40');
    expect(text()).toContain('86.72');
    expect(text()).toContain('346.88');
    expect(text()).toContain('Expired package credit');
    expect(text()).toContain('Deduction (next payout)');
  });

  it('lists the payouts with the tax taken and opens the existing 50 tawi certificate for a transferred run', async () => {
    await open();
    expect(text()).toContain('2026-W41');
    expect(text()).toContain('1,940.00');
    expect(text()).toContain('-฿60.00');
    const certificate = buttons().find((b) => b.textContent?.includes('50 tawi certificate'))!;
    certificate.click();
    const seen = await settleWith(harness, httpMock, [
      ...routes(),
      { url: '/api/payout/instructor/tax-certificates/pi-1', reply: {} },
    ]);
    expect(seen.some((request) => request.request.url === '/api/payout/instructor/tax-certificates/pi-1')).toBe(true);
  });

  it('points at the existing payout account page when there is no verified account', async () => {
    await open([{ url: WALLET_URL, reply: wallet({ hasVerifiedPayoutAccount: false }) }]);
    expect(text()).toContain('no verified bank account');
    const link = [...page().querySelectorAll('a')].find((a) => a.textContent?.includes('Go to your payout account'))!;
    expect(link.getAttribute('href')).toBe('/instructor/earnings');
  });

  it('shows a negative available amount as a deduction carried to the next payout, and the below-minimum note', async () => {
    await open([{ url: WALLET_URL, reply: wallet({ availableAmount: -50, meetsMinimum: false, estimatedNetAvailable: 0 }) }]);
    expect(text()).toContain('A negative amount comes from a refund');
    expect(text()).toContain('below the minimum and rolls over');
  });

  it('shows empty states for a tutor with no earnings yet', async () => {
    await open([
      { url: `${WALLET_URL}/ledger`, reply: paged([]) },
      { url: `${WALLET_URL}/payouts`, reply: paged([]) },
    ]);
    expect(text()).toContain('No earnings yet');
    expect(text()).toContain('No payouts yet');
  });

  it('shows an error with a retry when the wallet cannot be loaded, and still loads the rest on retry', async () => {
    await open([{ url: WALLET_URL, status: 500, reply: { status: 500 } }]);
    expect(text()).toContain('Could not load your wallet');
    buttons().find((b) => b.textContent?.trim() === 'Try again')!.click();
    await settleWith(harness, httpMock, routes());
    expect(text()).toContain('4,500.00');
  });
});
