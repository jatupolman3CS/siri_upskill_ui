import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardPaymentPanel, PENDING_CARD_PAYMENT_ID_STORAGE_KEY } from './card-payment-panel';

/**
 * `@stripe/stripe-js`'s `loadStripe` is the only export this component touches, and it's always
 * behind a dynamic `import()` inside `initializeStripe()` so it stays out of the initial bundle
 * (see this component's own doc comment) — `vi.mock` intercepts that dynamic import the same way
 * it intercepts a static one, matching the established pattern for third-party SDKs in this
 * codebase (see `media-api.service.spec.ts`'s `tus-js-client` mock).
 */
const stripeMocks = vi.hoisted(() => ({
  loadStripe: vi.fn(),
}));
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: stripeMocks.loadStripe,
}));

interface FakeConfirmPaymentResult {
  readonly error?: { readonly message?: string };
}

/** `submit()` is `protected` (only the panel's own template button calls it) — this cast, matching
 * `checkout-page.spec.ts`'s established `testAccess()` pattern for reaching protected members from
 * a spec, is an explicit `unknown` assertion (legal in strict mode), not a bracket-notation
 * visibility bypass (which `strict: true` would reject at compile time). */
function testAccess(panel: CardPaymentPanel): { readonly submit: () => Promise<void> } {
  return panel as unknown as { readonly submit: () => Promise<void> };
}

function createFakeStripe(confirmPaymentResult: FakeConfirmPaymentResult) {
  const mount = vi.fn();
  const create = vi.fn(() => ({ mount }));
  const elements = vi.fn(() => ({ create }));
  const confirmPayment = vi.fn().mockResolvedValue(confirmPaymentResult);
  return { elements, confirmPayment, mount, create };
}

/** Flushes the microtask chain inside `initializeStripe()`/`submit()` (dynamic `import()`, then
 * `await loadStripe(...)`/`await confirmPayment(...)`) and re-renders. `afterNextRender`'s own
 * callback here fires off `initializeStripe()` without awaiting it (a real async function cannot
 * be awaited from a render callback), so `fixture.whenStable()` alone does not reliably wait for
 * it — a macrotask tick lets every already-queued microtask drain first, the same technique this
 * codebase already established for other async-resource specs (see CLAUDE.md's P1-21 notes). */
async function flush(fixture: ComponentFixture<CardPaymentPanel>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

describe('CardPaymentPanel', () => {
  let fixture: ComponentFixture<CardPaymentPanel>;
  let component: CardPaymentPanel;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ imports: [CardPaymentPanel] });
    fixture = TestBed.createComponent(CardPaymentPanel);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('clientSecret', 'pi_test_secret');
    fixture.componentRef.setInput('paymentId', 'payment-789');
    fixture.componentRef.setInput('publishableKey', 'pk_test_123');
    fixture.componentRef.setInput('returnUrl', 'https://example.test/checkout/order-1');
  });

  afterEach(() => {
    fixture.destroy();
    sessionStorage.clear();
  });

  it('shows a translated load-failed error and does not mount an element when Stripe.js fails to load', async () => {
    stripeMocks.loadStripe.mockResolvedValue(null);
    const errors: string[] = [];
    component.paymentError.subscribe((message) => errors.push(message));

    fixture.detectChanges();
    await flush(fixture);

    expect(errors).toEqual(['checkout.card.loadFailed']);
    // The panel emits the i18n KEY (its own consumer resolves it) — the rendered DOM shows the
    // already-translated Thai text for that same key, not the raw key string.
    expect(fixture.nativeElement.textContent).toContain('ไม่สามารถโหลดระบบชำระเงินได้');
    // No pay button should render — nothing was ever mounted to confirm.
    expect(fixture.nativeElement.querySelector('app-button')).toBeNull();
  });

  it('mounts the Payment Element and shows the pay button once Stripe.js loads successfully', async () => {
    const stripe = createFakeStripe({});
    stripeMocks.loadStripe.mockResolvedValue(stripe);

    fixture.detectChanges();
    await flush(fixture);

    expect(stripeMocks.loadStripe).toHaveBeenCalledWith('pk_test_123');
    expect(stripe.elements).toHaveBeenCalledWith({ clientSecret: 'pi_test_secret' });
    expect(stripe.create).toHaveBeenCalledWith('payment');
    expect(stripe.mount).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('app-button')).not.toBeNull();
  });

  it('writes the pending payment id to sessionStorage before calling confirmPayment, and surfaces a confirmPayment error without emitting confirmedInline', async () => {
    // Captures what sessionStorage already holds AT THE MOMENT confirmPayment is invoked, rather
    // than spying on `setItem` — proves the write-before-call ordering the contract requires (a
    // 3DS full-page redirect can happen synchronously inside confirmPayment and destroy this
    // component before anything after that call in submit() would run) by observing the real
    // effect, not an implementation detail of how the write happens.
    let pendingIdAtConfirmTime: string | null = null;
    const mount = vi.fn();
    const create = vi.fn(() => ({ mount }));
    const elements = vi.fn(() => ({ create }));
    const confirmPayment = vi.fn(() => {
      pendingIdAtConfirmTime = sessionStorage.getItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY);
      return Promise.resolve({ error: { message: 'Your card was declined.' } });
    });
    const stripe = { elements, confirmPayment };
    stripeMocks.loadStripe.mockResolvedValue(stripe);
    const errors: string[] = [];
    let confirmedInlineCount = 0;
    component.paymentError.subscribe((message) => errors.push(message));
    component.confirmedInline.subscribe(() => confirmedInlineCount++);

    fixture.detectChanges();
    await flush(fixture);

    await testAccess(component).submit();
    fixture.detectChanges();

    expect(pendingIdAtConfirmTime).toBe('payment-789');
    expect(sessionStorage.getItem(PENDING_CARD_PAYMENT_ID_STORAGE_KEY)).toBe('payment-789');

    expect(stripe.confirmPayment).toHaveBeenCalledWith({
      elements: expect.anything(),
      clientSecret: 'pi_test_secret',
      confirmParams: { return_url: 'https://example.test/checkout/order-1' },
      redirect: 'if_required',
    });
    expect(errors).toEqual(['Your card was declined.']);
    expect(confirmedInlineCount).toBe(0);
  });

  it('emits confirmedInline — never a success state of its own — when confirmPayment resolves with no error', async () => {
    const stripe = createFakeStripe({});
    stripeMocks.loadStripe.mockResolvedValue(stripe);
    let confirmedInlineCount = 0;
    const errors: string[] = [];
    component.confirmedInline.subscribe(() => confirmedInlineCount++);
    component.paymentError.subscribe((message) => errors.push(message));

    fixture.detectChanges();
    await flush(fixture);
    await testAccess(component).submit();
    fixture.detectChanges();

    expect(confirmedInlineCount).toBe(1);
    expect(errors).toEqual([]);
  });
});
