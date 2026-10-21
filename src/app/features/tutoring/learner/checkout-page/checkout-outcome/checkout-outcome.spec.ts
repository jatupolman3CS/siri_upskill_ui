import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { Booking } from '../../../data/tutoring-learner.models';
import type { TutoringPaymentState } from '../../../data/tutoring-payment.models';
import { booking, confirmedBooking, paymentState } from '../../testing/learner-fixtures';
import { CheckoutOutcome, type CheckoutOutcomeKind } from './checkout-outcome';

describe('CheckoutOutcome', () => {
  let fixture: ComponentFixture<CheckoutOutcome>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CheckoutOutcome], providers: [provideRouter([])] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(CheckoutOutcome);
  });

  function render(kind: CheckoutOutcomeKind, value: Booking, extra: { state?: TutoringPaymentState; myTutoring?: boolean } = {}): HTMLElement {
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('booking', value);
    fixture.componentRef.setInput('paymentState', extra.state ?? null);
    fixture.componentRef.setInput('myTutoringAvailable', extra.myTutoring ?? false);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const hrefs = (root: HTMLElement): string[] => Array.from(root.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href') ?? '');

  describe('confirmed', () => {
    it('confirms a paid lesson, says an e-mail was sent and when joining opens (Bangkok time)', () => {
      const root = render('confirmed', confirmedBooking());

      expect(root.querySelector('h2')?.textContent?.trim()).toBe('Your lesson is booked');
      expect(root.textContent).toContain('Payment received - your lesson is confirmed.');
      expect(root.textContent).toContain('confirmation to your e-mail');
      // 2026-10-20T10:45Z = 17:45 in Bangkok.
      expect(root.textContent).toContain('You can join from Tue 20 Oct 17:45.');
    });

    it('words a free trial differently from a paid lesson', () => {
      const root = render('confirmed', confirmedBooking({ priceAmount: 0, isTrial: true }));

      expect(root.textContent).toContain('Your free trial lesson is confirmed.');
      expect(root.textContent).not.toContain('Payment received');
    });

    it('links to "My lessons" only when that page exists in this build', () => {
      expect(hrefs(render('confirmed', confirmedBooking()))).not.toContain('/my-tutoring');
      expect(hrefs(render('confirmed', confirmedBooking(), { myTutoring: true }))).toContain('/my-tutoring');
    });

    it('always offers a way back to the tutor and to the tutor search', () => {
      const links = hrefs(render('confirmed', confirmedBooking()));

      expect(links).toContain('/tutors/nina-tutor');
      expect(links).toContain('/tutors');
    });
  });

  describe('ended', () => {
    it('explains that an unpaid hold was released and that a payment made just in time is confirmed or refunded in full', () => {
      const root = render('ended', booking({ status: 'Expired' }));

      expect(root.querySelector('h2')?.textContent?.trim()).toBe('The time you held has been released');
      expect(root.textContent).toContain('Nothing is charged for a booking that was not paid');
      expect(root.textContent).toContain('confirm the booking or refund the full amount');
    });

    it('says a cancelled booking is cancelled, without the payment-window wording', () => {
      const root = render('ended', booking({ status: 'CancelledByTutor' }));

      expect(root.querySelector('h2')?.textContent?.trim()).toBe('This booking was cancelled');
      expect(root.textContent).not.toContain('payment window');
    });

    it('offers to book the tutor again instead of a dead end', () => {
      expect(hrefs(render('ended', booking({ status: 'Expired' })))).toContain('/tutors/nina-tutor');
    });
  });

  describe('finalized', () => {
    it('says the lesson already took place and names the status', () => {
      const root = render('finalized', booking({ status: 'Completed' }));

      expect(root.textContent).toContain('This lesson has already taken place');
      expect(root.textContent).toContain('Status: Completed.');
    });
  });

  describe('refunded', () => {
    it('tells a late payer the full amount is returned, with the PromptPay delay stated plainly', () => {
      const root = render('refunded', booking({ status: 'Expired' }), { state: paymentState({ status: 'Succeeded', lateResolution: 'Refunded' }) });

      expect(root.querySelector('h2')?.textContent?.trim()).toBe('Your payment is being refunded');
      expect(root.textContent).toContain('no longer free, so the full amount is being returned');
      expect(root.textContent).toContain('Amount returned: ฿450.00.');
      expect(root.textContent).toContain('Stripe may email you to ask for your bank account details');
    });

    it('words a duplicate payment differently and leaves out the PromptPay note for a card payment', () => {
      const root = render('refunded', confirmedBooking(), {
        state: paymentState({ status: 'Succeeded', lateResolution: 'Duplicate', method: 'Card' }),
      });

      expect(root.textContent).toContain('already been paid, so the extra payment is being returned');
      expect(root.textContent).not.toContain('Stripe may email you');
    });
  });
});
