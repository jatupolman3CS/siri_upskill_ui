import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { qrPayment } from '../../testing/learner-fixtures';
import { PromptPayPanel } from './promptpay-panel';

describe('PromptPayPanel', () => {
  let fixture: ComponentFixture<PromptPayPanel>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PromptPayPanel] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(PromptPayPanel);
    fixture.componentRef.setInput('payment', qrPayment());
    fixture.componentRef.setInput('bookingNo', 'TB-261014-A1B2C3');
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('shows the server-created QR with a text alternative on a white quiet zone', () => {
    const image = root().querySelector('img');

    expect(image?.getAttribute('src')).toBe('https://qr.example.test/pay-1.png');
    expect(image?.getAttribute('alt')).toBe('PromptPay QR code for this payment');
    expect(image?.parentElement?.className).toContain('bg-white');
  });

  it('shows the amount the payment was created for (the server figure, formatted) and the booking reference', () => {
    expect(root().textContent).toContain('฿450.00');
    expect(root().textContent).toContain('Booking TB-261014-A1B2C3');
  });

  it('leaves the reference line out when there is no booking number - a package purchase has none to show', () => {
    fixture.componentRef.setInput('bookingNo', null);
    fixture.detectChanges();

    expect(root().textContent).not.toContain('Booking');
    expect(root().textContent).toContain('฿450.00');
  });

  it('explains the three steps and says it waits quietly for the confirmation', () => {
    expect(root().querySelectorAll('ol li')).toHaveLength(3);
    expect(root().textContent).toContain('Waiting for your payment...');
  });

  it('never claims the payment succeeded - only the polled server state may change the page', () => {
    expect(root().textContent?.toLowerCase()).not.toContain('payment received');
    expect(root().textContent?.toLowerCase()).not.toContain('success');
  });
});
