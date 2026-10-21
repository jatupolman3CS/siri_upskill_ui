import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { PackagePurchaseSummary } from '../../../data/tutoring-package-purchase.models';
import { activePurchase, packagePurchase } from '../../../testing/package-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { PackageCard } from './package-card';

registerLocaleData(localeTh);

describe('PackageCard', () => {
  let fixture: ComponentFixture<PackageCard>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PackageCard], providers: [provideRouter([])] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(PackageCard);
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => root().textContent?.replace(/\s+/g, ' ') ?? '';
  const hrefs = (): string[] => Array.from(root().querySelectorAll('a')).map((anchor) => anchor.getAttribute('href') ?? '');

  function render(purchase: PackagePurchaseSummary): void {
    fixture.componentRef.setInput('purchase', purchase);
    fixture.detectChanges();
  }

  it('shows the credits left, the length of a lesson, the price and the expiry exactly as the server sent them', () => {
    render(activePurchase());

    expect(root().querySelector('h2')?.textContent?.trim()).toBe('10 lessons of 60 minutes');
    expect(text()).toContain('With Nina Tutor, for Mint');
    expect(text()).toContain('7 of 10 lessons left');
    expect(text()).toContain('60 minutes per lesson');
    expect(text()).toContain('฿4,050.00');
    // 2027-01-12T03:05Z is 10:05 in Bangkok.
    expect(text()).toContain('Valid until 12 Jan 2027 10:05');
    expect(text()).toContain('Active');
  });

  it('says on a usable package that lessons not used by the expiry date are not refunded', () => {
    render(activePurchase());

    expect(text()).toContain('Lessons not used by the expiry date are not refunded.');
  });

  it('offers a booking and the details for a package with credits left - and no payment', () => {
    render(activePurchase());

    expect(hrefs()).toEqual(['/my-tutoring/packages/pp-1', '/my-tutoring/packages/pp-1']);
    expect(text()).toContain('Book a lesson');
    expect(text()).not.toContain('Pay now');
  });

  it('offers the payment, with the deadline, for a purchase that is still unpaid', () => {
    render(packagePurchase());

    expect(text()).toContain('Waiting for payment');
    expect(text()).toContain('Pay before 14 Oct 2026 10:30');
    expect(text()).not.toContain('lessons left');
    expect(hrefs()).toContain('/tutoring/checkout/package/pp-1');
    expect(text()).not.toContain('Book a lesson');
  });

  it('does not offer a payment for a purchase the server says needs none', () => {
    render(packagePurchase({ requiresPayment: false }));

    expect(hrefs()).not.toContain('/tutoring/checkout/package/pp-1');
  });

  it('offers no booking once every lesson is booked, but keeps the details', () => {
    render(activePurchase({ status: 'Exhausted', creditsRemaining: 0, sessionsUsed: 10 }));

    expect(text()).toContain('0 of 10 lessons left');
    expect(text()).not.toContain('Book a lesson');
    expect(hrefs()).toEqual(['/my-tutoring/packages/pp-1']);
  });

  it('reads a package that ran out of time but is not yet closed as being reviewed, and offers no booking', () => {
    render(activePurchase({ expiredPendingSettlement: true, expiresAtUtc: '2026-10-01T03:00:00Z' }));

    expect(text()).toContain('Expired (being reviewed)');
    expect(text()).toContain('being reviewed by our team');
    expect(text()).not.toContain('Book a lesson');
  });

  it('shows when an expired package ran out, and shows no credit bar for a cancelled purchase', () => {
    render(activePurchase({ status: 'Expired', expiresAtUtc: '2026-10-01T03:00:00Z' }));
    expect(text()).toContain('Ran out on 1 Oct 2026 10:00');

    render(packagePurchase({ status: 'Cancelled', pendingExpiresAtUtc: null, requiresPayment: false }));
    expect(text()).toContain('Cancelled');
    expect(text()).not.toContain('lessons left');
  });

  it('draws the used part of the credit bar from the counts - decoration only, the words carry the meaning', () => {
    render(activePurchase());

    const bar = root().querySelector('[aria-hidden="true"] > div') as HTMLElement;
    expect(bar.style.width).toBe('30%');
  });

  it('falls back to an initial when the tutor has no photo', () => {
    render(activePurchase());

    expect(root().querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('N');
  });
});
