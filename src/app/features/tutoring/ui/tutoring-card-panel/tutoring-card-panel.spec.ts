import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import {
  PENDING_TUTORING_PAYMENT_STORAGE_KEY,
  TutoringCardPanel,
  takePendingTutoringPaymentId,
} from './tutoring-card-panel';

/** `loadStripe` sits behind a dynamic `import()` in the component; `vi.mock` intercepts it exactly like a static import. */
const stripeMocks = vi.hoisted(() => ({ loadStripe: vi.fn() }));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: stripeMocks.loadStripe }));

/** `submit()` is protected (only the panel's own button calls it); an `unknown` cast reaches it from the spec. */
function testAccess(panel: TutoringCardPanel): { readonly submit: () => Promise<void> } {
  return panel as unknown as { readonly submit: () => Promise<void> };
}

/** Drains the microtasks of `initializeStripe()` / `submit()` (dynamic import, `await loadStripe`) and re-renders. */
async function flush(fixture: ComponentFixture<TutoringCardPanel>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function fakeStripe(confirmPayment: () => Promise<{ error?: { message?: string } }>) {
  const mount = vi.fn();
  const create = vi.fn(() => ({ mount }));
  const elements = vi.fn(() => ({ create }));
  return { elements, create, mount, confirmPayment: vi.fn(confirmPayment) };
}

describe('TutoringCardPanel', () => {
  let fixture: ComponentFixture<TutoringCardPanel>;
  let panel: TutoringCardPanel;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ imports: [TutoringCardPanel] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(TutoringCardPanel);
    panel = fixture.componentInstance;
    fixture.componentRef.setInput('clientSecret', 'pi_test_secret');
    fixture.componentRef.setInput('paymentId', 'pay-1');
    fixture.componentRef.setInput('publishableKey', 'pk_test_123');
    fixture.componentRef.setInput('returnUrl', 'https://example.test/tutoring/checkout/b-1');
  });

  afterEach(() => {
    fixture.destroy();
    sessionStorage.clear();
  });

  it('reports a load failure with its i18n key and shows no pay button when Stripe.js cannot be loaded', async () => {
    stripeMocks.loadStripe.mockResolvedValue(null);
    const errors: string[] = [];
    panel.paymentError.subscribe((message) => errors.push(message));

    fixture.detectChanges();
    await flush(fixture);

    expect(errors).toEqual(['tutoring.checkout.card.loadFailed']);
    expect(fixture.nativeElement.textContent).toContain('Could not load the card form');
    expect(fixture.nativeElement.querySelector('app-button')).toBeNull();
  });

  it('mounts the Payment Element once and shows the pay button when Stripe.js loads', async () => {
    const stripe = fakeStripe(() => Promise.resolve({}));
    stripeMocks.loadStripe.mockResolvedValue(stripe);

    fixture.detectChanges();
    await flush(fixture);

    expect(stripeMocks.loadStripe).toHaveBeenCalledWith('pk_test_123');
    expect(stripe.elements).toHaveBeenCalledWith({ clientSecret: 'pi_test_secret' });
    expect(stripe.create).toHaveBeenCalledWith('payment');
    expect(stripe.mount).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('app-button')).not.toBeNull();
  });

  it('writes the pending payment id BEFORE confirmPayment (a 3-D Secure redirect can destroy the page inside that call)', async () => {
    let storedAtConfirm: string | null = null;
    const stripe = fakeStripe(() => {
      storedAtConfirm = sessionStorage.getItem(PENDING_TUTORING_PAYMENT_STORAGE_KEY);
      return Promise.resolve({});
    });
    stripeMocks.loadStripe.mockResolvedValue(stripe);

    fixture.detectChanges();
    await flush(fixture);
    await testAccess(panel).submit();

    expect(storedAtConfirm).toBe('pay-1');
    expect(stripe.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSecret: 'pi_test_secret',
        confirmParams: { return_url: 'https://example.test/tutoring/checkout/b-1' },
        redirect: 'if_required',
      }),
    );
  });

  it('uses its own storage key, never the Commerce one', () => {
    expect(PENDING_TUTORING_PAYMENT_STORAGE_KEY).toBe('siri.tutoring.checkout.pendingPaymentId');
    expect(PENDING_TUTORING_PAYMENT_STORAGE_KEY).not.toBe('siri.checkout.pendingPaymentId');
  });

  it('emits the Stripe error message (and not confirmedInline) when confirmPayment fails, and can be submitted again', async () => {
    const stripe = fakeStripe(() => Promise.resolve({ error: { message: 'Your card was declined.' } }));
    stripeMocks.loadStripe.mockResolvedValue(stripe);
    const errors: string[] = [];
    const confirmed = vi.fn();
    panel.paymentError.subscribe((message) => errors.push(message));
    panel.confirmedInline.subscribe(confirmed);

    fixture.detectChanges();
    await flush(fixture);
    await testAccess(panel).submit();
    fixture.detectChanges();

    expect(errors).toEqual(['Your card was declined.']);
    expect(confirmed).not.toHaveBeenCalled();
    await testAccess(panel).submit();
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(2);
  });

  it('only reports "finished" when confirmPayment succeeds without leaving the page - that is not a payment result', async () => {
    const stripe = fakeStripe(() => Promise.resolve({}));
    stripeMocks.loadStripe.mockResolvedValue(stripe);
    const confirmed = vi.fn();
    panel.confirmedInline.subscribe(confirmed);

    fixture.detectChanges();
    await flush(fixture);
    await testAccess(panel).submit();

    expect(confirmed).toHaveBeenCalledOnce();
  });

  it('ignores a second submit while the first is still running (double-submit guard)', async () => {
    let release: (() => void) | undefined;
    const stripe = fakeStripe(() => new Promise((resolve) => (release = () => resolve({}))));
    stripeMocks.loadStripe.mockResolvedValue(stripe);

    fixture.detectChanges();
    await flush(fixture);
    const first = testAccess(panel).submit();
    await testAccess(panel).submit();
    release?.();
    await first;

    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1);
  });
});

describe('takePendingTutoringPaymentId', () => {
  afterEach(() => sessionStorage.clear());

  it('returns the stored id once and clears it', () => {
    sessionStorage.setItem(PENDING_TUTORING_PAYMENT_STORAGE_KEY, 'pay-9');

    expect(takePendingTutoringPaymentId()).toBe('pay-9');
    expect(takePendingTutoringPaymentId()).toBeNull();
  });

  it('returns null when nothing is stored or storage is blocked', () => {
    expect(takePendingTutoringPaymentId()).toBeNull();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(takePendingTutoringPaymentId()).toBeNull();
    getItem.mockRestore();
  });
});
