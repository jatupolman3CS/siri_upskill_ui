import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { TutoringPaymentMethod } from '../../../data/tutoring-payment.models';
import { PaymentMethodChoice } from './payment-method-choice';

describe('PaymentMethodChoice', () => {
  let fixture: ComponentFixture<PaymentMethodChoice>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PaymentMethodChoice] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(PaymentMethodChoice);
  });

  function render(methods: readonly TutoringPaymentMethod[], selected: TutoringPaymentMethod, disabled = false): void {
    fixture.componentRef.setInput('methods', methods);
    fixture.componentRef.setInput('selected', selected);
    fixture.componentRef.setInput('disabled', disabled);
    fixture.detectChanges();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const radios = (): HTMLInputElement[] => Array.from(root().querySelectorAll<HTMLInputElement>('input[type="radio"]'));

  it('offers only the methods the server enabled, as one native radio group with a legend', () => {
    render(['PromptPay'], 'PromptPay');

    expect(root().querySelector('legend')?.textContent?.trim()).toBe('Payment method');
    expect(radios()).toHaveLength(1);
    expect(root().textContent).toContain('PromptPay QR');
    expect(root().textContent).not.toContain('Credit or debit card');
  });

  it('shows card as a second option when it is enabled, sharing one group name', () => {
    render(['PromptPay', 'Card'], 'PromptPay');

    expect(radios().map((radio) => radio.value)).toEqual(['PromptPay', 'Card']);
    expect(new Set(radios().map((radio) => radio.name)).size).toBe(1);
    expect(radios().map((radio) => radio.checked)).toEqual([true, false]);
  });

  it('reports the choice made by the person', () => {
    render(['PromptPay', 'Card'], 'PromptPay');
    const changes: TutoringPaymentMethod[] = [];
    fixture.componentInstance.selected.subscribe((method) => changes.push(method));

    radios()[1].click();
    fixture.detectChanges();

    expect(changes).toEqual(['Card']);
    expect(radios()[1].checked).toBe(true);
  });

  it('disables the whole group while a payment is being created', () => {
    render(['PromptPay', 'Card'], 'PromptPay', true);

    expect(root().querySelector('fieldset')?.disabled).toBe(true);
  });
});
