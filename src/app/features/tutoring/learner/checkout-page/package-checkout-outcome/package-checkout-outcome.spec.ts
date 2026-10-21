import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { PackagePurchaseSummary } from '../../../data/tutoring-package-purchase.models';
import type { TutoringPaymentState } from '../../../data/tutoring-payment.models';
import { activePurchase, packagePurchase } from '../../../testing/package-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { paymentState } from '../../testing/learner-fixtures';
import type { CheckoutOutcomeKind } from '../checkout-outcome/checkout-outcome';
import { PackageCheckoutOutcome } from './package-checkout-outcome';

registerLocaleData(localeTh);

describe('PackageCheckoutOutcome', () => {
  let fixture: ComponentFixture<PackageCheckoutOutcome>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PackageCheckoutOutcome], providers: [provideRouter([])] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(PackageCheckoutOutcome);
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => root().textContent?.replace(/\s+/g, ' ') ?? '';
  const hrefs = (): string[] => Array.from(root().querySelectorAll('a')).map((anchor) => anchor.getAttribute('href') ?? '');

  function render(kind: CheckoutOutcomeKind, purchase: PackagePurchaseSummary, state: TutoringPaymentState | null = null): void {
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('purchase', purchase);
    fixture.componentRef.setInput('paymentState', state);
    fixture.detectChanges();
  }

  it('confirms a paid package: what is ready, until when, the no-refund rule and the way to book', () => {
    render('confirmed', activePurchase());

    expect(root().querySelector('#checkout-state-heading')?.textContent?.trim()).toBe('Your package is ready');
    expect(text()).toContain('book your 10 lessons of 60 minutes');
    expect(text()).toContain('Use them before 12 Jan 2027 10:05');
    expect(text()).toContain('Lessons not used by the expiry date are not refunded.');
    expect(hrefs()).toContain('/my-tutoring/packages/pp-1');
    expect(hrefs()).toContain('/my-tutoring/packages');
    expect(hrefs()).toContain('/tutors/nina-tutor');
  });

  it('says an ended purchase charged nothing, and that a payment made just before is confirmed or fully refunded', () => {
    render('ended', packagePurchase({ status: 'Cancelled' }));

    expect(text()).toContain('This purchase was not completed');
    expect(text()).toContain('nothing is charged for it');
    expect(text()).toContain('either activate the package or refund the full amount');
    expect(hrefs()).not.toContain('/my-tutoring/packages/pp-1');
  });

  it('says an expired package can no longer be booked', () => {
    render('finalized', activePurchase({ status: 'Expired' }));

    expect(text()).toContain('This package has expired');
    expect(text()).toContain('can no longer be booked');
  });

  it('explains a late payment that is being refunded in full, with the amount and the PromptPay note', () => {
    render('refunded', packagePurchase({ status: 'Cancelled' }), paymentState({ kind: 'Package', referenceId: 'pp-1', amount: 4050, status: 'Succeeded', lateResolution: 'Refunded' }));

    expect(text()).toContain('Your payment is being refunded');
    expect(text()).toContain('arrived after this purchase was closed');
    expect(text()).toContain('Amount returned: ฿4,050.00.');
    expect(text()).toContain('PromptPay refunds are handled by Stripe');
  });

  it('uses the duplicate wording when the package had already been paid, and no PromptPay note for a card', () => {
    render(
      'refunded',
      activePurchase(),
      paymentState({ kind: 'Package', referenceId: 'pp-1', amount: 4050, method: 'Card', status: 'Succeeded', lateResolution: 'Duplicate' }),
    );

    expect(text()).toContain('had already been paid for');
    expect(text()).not.toContain('PromptPay refunds');
  });
});
