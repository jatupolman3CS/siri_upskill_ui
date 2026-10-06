import { afterEach, describe, expect, it } from 'vitest';

import { PENDING_CARD_PAYMENT_ID_STORAGE_KEY } from './card-payment-panel/card-payment-panel';
import { decideCardPaymentResumeAction, takePendingCardPaymentId } from './card-payment-resume';

describe('decideCardPaymentResumeAction', () => {
  it('polls the pending payment when a payment id survived in sessionStorage', () => {
    expect(decideCardPaymentResumeAction('payment-123')).toEqual({
      kind: 'pollPayment',
      paymentId: 'payment-123',
    });
  });

  it('falls back to the generic resuming state when there is no pending payment id', () => {
    expect(decideCardPaymentResumeAction(null)).toEqual({ kind: 'resumeGeneric' });
  });
});

describe('takePendingCardPaymentId', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('reads and clears the pending payment id written by CardPaymentPanel', () => {
    sessionStorage.setItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY, 'payment-456');

    expect(takePendingCardPaymentId()).toBe('payment-456');
    expect(sessionStorage.getItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY)).toBeNull();
  });

  it('returns null when nothing was pending', () => {
    expect(takePendingCardPaymentId()).toBeNull();
  });

  it('degrades to null instead of throwing when sessionStorage access fails (private browsing/blocked storage)', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get(): Storage {
        throw new Error('SecurityError: sessionStorage access blocked');
      },
    });

    try {
      expect(takePendingCardPaymentId()).toBeNull();
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original });
    }
  });
});
