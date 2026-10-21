import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { PackagePurchaseSummary } from '../../../data/tutoring-package-purchase.models';
import { activePurchase, packagePurchase } from '../../../testing/package-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { PackageCheckoutSummary } from './package-checkout-summary';

registerLocaleData(localeTh);

describe('PackageCheckoutSummary', () => {
  let fixture: ComponentFixture<PackageCheckoutSummary>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PackageCheckoutSummary] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(PackageCheckoutSummary);
  });

  function render(value: PackagePurchaseSummary): string {
    fixture.componentRef.setInput('purchase', value);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  }

  it('summarises the package: who teaches, what is bought, for whom, and the price the server fixed', () => {
    const text = render(packagePurchase());

    expect(text).toContain('Waiting for payment');
    expect(text).toContain('Nina Tutor');
    expect(text).toContain('10 lessons of 60 minutes');
    expect(text).toContain('Mint');
    expect(text).toContain('฿4,050.00');
  });

  it('always says that lessons not used by the expiry date are not refunded, even before there is an expiry date', () => {
    const text = render(packagePurchase());

    expect(text).toContain('Lessons not used by the expiry date are not refunded.');
    expect(text).not.toContain('Valid until');
  });

  it('shows the expiry date the server set once the purchase is paid - in Bangkok time, never worked out here', () => {
    const text = render(activePurchase());

    // 2027-01-12T03:05Z is 10:05 in Bangkok.
    expect(text).toContain('Valid until');
    expect(text).toContain('12 Jan 2027 10:05');
    expect(text).toContain('Active');
  });

  it('names Thailand time', () => {
    expect(render(packagePurchase())).toContain('Asia/Bangkok');
  });
});
