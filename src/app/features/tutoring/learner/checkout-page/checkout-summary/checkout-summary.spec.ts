import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { TranslationService } from '../../../../../core/i18n/translation.service';
import type { Booking } from '../../../data/tutoring-learner.models';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { booking, confirmedBooking } from '../../testing/learner-fixtures';
import { CheckoutSummary } from './checkout-summary';

registerLocaleData(localeTh);

describe('CheckoutSummary', () => {
  let fixture: ComponentFixture<CheckoutSummary>;
  let translation: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CheckoutSummary] });
    translation = useTutoringLanguage('en');
    fixture = TestBed.createComponent(CheckoutSummary);
  });

  function render(value: Booking): string {
    fixture.componentRef.setInput('booking', value);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  }

  it('summarises the lesson with Bangkok times and the booking price', () => {
    const text = render(booking());

    expect(text).toContain('TB-261014-A1B2C3');
    expect(text).toContain('Waiting for payment');
    expect(text).toContain('Nina Tutor');
    expect(text).toContain('Physics');
    expect(text).toContain('Upper secondary');
    expect(text).toContain('One-on-one');
    expect(text).toContain('60 minutes');
    // 2026-10-20T11:00Z = 18:00 in Bangkok.
    expect(text).toContain('Tue 20 Oct, 18:00-19:00');
    expect(text).toContain('Mint');
    expect(text).toContain('Secondary 4');
    expect(text).toContain('฿450.00');
  });

  it('labels a trial and shows "Free" for a booking priced at zero', () => {
    const text = render(confirmedBooking({ isTrial: true, priceAmount: 0 }));

    expect(text).toContain('trial');
    expect(text).toContain('Free');
    expect(text).not.toContain('฿');
  });

  it('follows the language picked in the header for the subject', () => {
    translation.setLocale('th');

    expect(render(booking())).toContain('Physics (TH)');
  });
});
