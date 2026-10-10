import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { PagedResult } from '../../../core/http/paged-result.model';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { PaymentAmountOverrideEntry, PaymentAmountOverrideState } from './data/payment-amount-override.models';
import { AdminPaymentSettingsPage } from './admin-payment-settings-page';

const BASE = '/api/commerce/admin/payment-amount-override';

const NEVER_CHANGED: PaymentAmountOverrideState = {
  isEnabled: false,
  overrideAmount: null,
  reason: null,
  changedByUserId: null,
  changedAtUtc: null,
};

const ACTIVE_20: PaymentAmountOverrideState = {
  isEnabled: true,
  overrideAmount: 20,
  reason: 'smoke test before launch',
  changedByUserId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  changedAtUtc: '2026-10-10T03:00:00Z',
};

const ENTRY: PaymentAmountOverrideEntry = {
  id: 'h-1',
  isEnabled: true,
  overrideAmount: 20,
  reason: 'smoke test before launch',
  changedByUserId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  changedAtUtc: '2026-10-10T03:00:00Z',
};

const history = (items: readonly PaymentAmountOverrideEntry[] = [], totalPages = 1): PagedResult<PaymentAmountOverrideEntry> => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 20,
  totalPages,
});

describe('AdminPaymentSettingsPage', () => {
  let fixture: ComponentFixture<AdminPaymentSettingsPage>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        // withFetch, like production — the default XHR backend behaves differently from what runs for real.
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const isStateGet = (r: { method: string; url: string }) => r.method === 'GET' && r.url === BASE;
  const isHistoryGet = (r: { method: string; url: string }) => r.method === 'GET' && r.url === `${BASE}/history`;
  const isPut = (r: { method: string; url: string }) => r.method === 'PUT' && r.url === BASE;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function respond(request: TestRequest, body: object): void {
    if ('error' in body) {
      request.flush({}, { status: (body as { error: number }).error, statusText: 'Err' });
    } else {
      request.flush(body);
    }
  }

  /** Creates the page, answers its two first requests (a body, or `{ error: status }`) and renders. */
  async function open(
    state: PaymentAmountOverrideState | { error: number },
    historyBody: PagedResult<PaymentAmountOverrideEntry> | { error: number } = history(),
  ): Promise<void> {
    fixture = TestBed.createComponent(AdminPaymentSettingsPage);
    await settle();
    respond(httpMock.expectOne(isStateGet), state);
    respond(httpMock.expectOne(isHistoryGet), historyBody);
    await settle();
    await settle();
  }

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const form = () => root().querySelector('form') as HTMLFormElement | null;
  const checkbox = () => root().querySelector('input[type="checkbox"]') as HTMLInputElement;
  const amountInput = () => root().querySelector('input[type="number"]') as HTMLInputElement;
  const reasonInput = () => root().querySelector('textarea') as HTMLTextAreaElement;
  const dialog = () => root().querySelector('[role="dialog"]') as HTMLElement | null;
  const buttonByText = (scope: ParentNode, label: string) =>
    Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

  /** Types into the form like a person would: native events, so the real value accessors run. */
  async function fill(values: { enabled?: boolean; amount?: string; reason?: string }): Promise<void> {
    if (values.enabled !== undefined) {
      checkbox().checked = values.enabled;
      checkbox().dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (values.amount !== undefined) {
      amountInput().value = values.amount;
      amountInput().dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (values.reason !== undefined) {
      reasonInput().value = values.reason;
      reasonInput().dispatchEvent(new Event('input', { bubbles: true }));
    }
    await settle();
  }

  async function submit(): Promise<void> {
    form()?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  }

  describe('status', () => {
    it('shows a loud ACTIVE banner with the amount, who changed it, when and why', async () => {
      await open(ACTIVE_20, history([ENTRY]));

      expect(text()).toContain('ACTIVE');
      expect(text()).toContain('Right now every new payment is charged ฿20.00 instead of the real price');
      expect(text()).toContain('smoke test before launch');
      expect(text()).toContain('10 Oct 2026 10:00');
      // The short id is shown, the full one is available to assistive tech.
      expect(text()).toContain('0190a1b2');
      expect(text()).toContain('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
      expect(root().querySelector('[aria-live="polite"]')).not.toBeNull();
    });

    it('shows INACTIVE and "never changed" before anything was ever set, with the form ready and empty', async () => {
      await open(NEVER_CHANGED);

      expect(text()).toContain('INACTIVE');
      expect(text()).not.toContain('Right now every new payment');
      expect(text()).toContain('This setting has never been changed.');
      expect(checkbox().checked).toBe(false);
      expect(amountInput().value).toBe('');
      expect(reasonInput().value).toBe('');
    });

    it('prefills the form from the loaded state but leaves the reason empty (each change needs its own)', async () => {
      await open(ACTIVE_20);

      expect(checkbox().checked).toBe(true);
      expect(amountInput().value).toBe('20');
      expect(reasonInput().value).toBe('');
    });

    it('shows an error with a retry — and no form — when the setting cannot be loaded', async () => {
      await open({ error: 500 });

      expect(text()).toContain('Could not load the setting');
      expect(form()).toBeNull();

      buttonByText(root(), 'Try again').click();
      await settle();
      respond(httpMock.expectOne(isStateGet), NEVER_CHANGED);
      await settle();
      await settle();

      expect(form()).not.toBeNull();
    });
  });

  describe('saving', () => {
    it('does not send anything for an invalid form and shows the problems next to their fields', async () => {
      await open(NEVER_CHANGED);

      await submit();

      httpMock.expectNone(isPut);
      expect(dialog()).toBeNull();
      expect(text().match(/This field is required\./g)?.length).toBe(2);
      expect(amountInput().getAttribute('aria-invalid')).toBe('true');
      expect(reasonInput().getAttribute('aria-invalid')).toBe('true');
    });

    it('shows no error before the field was touched', async () => {
      await open(NEVER_CHANGED);

      expect(text()).not.toContain('This field is required.');
    });

    it('blocks an out-of-range amount locally', async () => {
      await open(NEVER_CHANGED);

      await fill({ enabled: true, amount: '2000001', reason: 'smoke test' });
      await submit();

      httpMock.expectNone(isPut);
      expect(text()).toContain('The amount must not exceed 2,000,000 baht.');
    });

    it('gates turning ON behind a confirmation that restates the amount and the real-money warning', async () => {
      await open(NEVER_CHANGED);
      await fill({ enabled: true, amount: '20', reason: '  smoke test  ' });

      await submit();

      httpMock.expectNone(isPut);
      const confirm = dialog();
      expect(confirm).not.toBeNull();
      expect(confirm?.textContent).toContain('Every new payment will be charged ฿20.00 instead of the real price');
      expect(confirm?.textContent).toContain('real money');
      expect(confirm?.textContent).toContain('Revenue share is calculated from the amount actually charged');

      buttonByText(confirm as HTMLElement, 'Confirm and turn on').click();
      await settle();

      const put = httpMock.expectOne(isPut);
      expect(put.request.body).toEqual({ isEnabled: true, overrideAmount: 20, reason: 'smoke test' });
      put.flush(ACTIVE_20);
      await settle();

      expect(TestBed.inject(ToastService).toasts().map((t) => t.type)).toEqual(['success']);
      expect(dialog()).toBeNull();
      // Both the setting and the history are refreshed.
      respond(httpMock.expectOne(isStateGet), ACTIVE_20);
      respond(httpMock.expectOne(isHistoryGet), history([ENTRY]));
      await settle();
      await settle();

      expect(text()).toContain('Right now every new payment is charged ฿20.00 instead of the real price');
      expect(text()).toContain('smoke test before launch');
      expect(reasonInput().value).toBe('');
    });

    it('sends nothing when the confirmation is cancelled', async () => {
      await open(NEVER_CHANGED);
      await fill({ enabled: true, amount: '20', reason: 'smoke test' });
      await submit();

      buttonByText(dialog() as HTMLElement, 'Cancel').click();
      await settle();

      httpMock.expectNone(isPut);
      expect(dialog()).toBeNull();
    });

    it('also asks for confirmation when the amount changes while the override is already ON', async () => {
      await open(ACTIVE_20);
      await fill({ amount: '50', reason: 'raise it' });

      await submit();

      httpMock.expectNone(isPut);
      expect(dialog()?.textContent).toContain('฿50.00');
    });

    it('saves without a confirmation when nothing about the charged amount changes', async () => {
      await open(ACTIVE_20);
      await fill({ reason: 'note for the record' });

      await submit();

      expect(dialog()).toBeNull();
      expect(httpMock.expectOne(isPut).request.body).toEqual({ isEnabled: true, overrideAmount: 20, reason: 'note for the record' });
    });

    it('turns OFF without a confirmation dialog but still requires a reason', async () => {
      await open(ACTIVE_20);
      await fill({ enabled: false });

      await submit();
      httpMock.expectNone(isPut);
      expect(text()).toContain('This field is required.');

      await fill({ reason: 'test finished' });
      await submit();

      expect(dialog()).toBeNull();
      const put = httpMock.expectOne(isPut);
      // The amount is sent even though it is being switched off.
      expect(put.request.body).toEqual({ isEnabled: false, overrideAmount: 20, reason: 'test finished' });
    });

    it('does not send twice while a save is in flight', async () => {
      await open(ACTIVE_20);
      await fill({ enabled: false, reason: 'test finished' });

      await submit();
      await submit();

      const puts = httpMock.match(isPut);
      expect(puts).toHaveLength(1);
      expect(root().querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);
    });

    it('maps the server 400 field errors onto their fields, closes the dialog, and clears them once the admin edits', async () => {
      await open(NEVER_CHANGED);
      await fill({ enabled: true, amount: '20', reason: 'smoke test' });
      await submit();
      buttonByText(dialog() as HTMLElement, 'Confirm and turn on').click();
      await settle();

      httpMock.expectOne(isPut).flush(
        { title: 'Validation', errors: { overrideAmount: ['Server: amount is not allowed'], reason: ['Server: reason is not allowed'] } },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(dialog()).toBeNull();
      expect(text()).toContain('Server: amount is not allowed');
      expect(text()).toContain('Server: reason is not allowed');
      expect(text()).toContain('Some details are not valid');
      expect(amountInput().getAttribute('aria-invalid')).toBe('true');
      expect(TestBed.inject(ToastService).toasts()).toHaveLength(0);

      await fill({ amount: '25' });

      expect(text()).not.toContain('Server: amount is not allowed');
      expect(text()).not.toContain('Some details are not valid');
    });

    it('shows a general error (not a success toast) when the save fails for another reason', async () => {
      await open(ACTIVE_20);
      await fill({ enabled: false, reason: 'test finished' });
      await submit();

      httpMock.expectOne(isPut).flush({}, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text()).toContain('An error occurred. Please try again.');
      expect(TestBed.inject(ToastService).toasts()).toHaveLength(0);
      // The form keeps what was typed so nothing has to be re-entered.
      expect(reasonInput().value).toBe('test finished');
    });
  });

  describe('history', () => {
    it('lists the audit entries with the date in Bangkok time, an on/off badge, the amount, reason and a short id', async () => {
      await open(ACTIVE_20, history([ENTRY, { ...ENTRY, id: 'h-0', isEnabled: false, overrideAmount: 15.5, reason: 'first try' }]));

      const rows = Array.from(root().querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain('10 Oct 2026 10:00');
      expect(rows[0].textContent).toContain('On');
      expect(rows[0].textContent).toContain('฿20.00');
      expect(rows[0].textContent).toContain('smoke test before launch');
      expect(rows[1].textContent).toContain('Off');
      expect(rows[1].textContent).toContain('฿15.50');
      expect(rows[0].querySelector('code')?.getAttribute('title')).toBe('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
      expect(root().querySelector('caption')).not.toBeNull();
    });

    it('shows an empty state when there is no history yet', async () => {
      await open(NEVER_CHANGED, history([]));

      expect(text()).toContain('No changes yet');
      expect(root().querySelector('table')).toBeNull();
    });

    it('shows an error with a retry — without hiding the setting — when the history cannot be loaded', async () => {
      await open(ACTIVE_20, { error: 500 });

      expect(text()).toContain('Could not load the history');
      expect(text()).toContain('ACTIVE');
      expect(form()).not.toBeNull();

      buttonByText(root(), 'Try again').click();
      await settle();
      respond(httpMock.expectOne(isHistoryGet), history([ENTRY]));
      await settle();
      await settle();

      expect(text()).not.toContain('Could not load the history');
      expect(root().querySelectorAll('tbody tr')).toHaveLength(1);
    });

    it('requests the chosen page when paginating', async () => {
      await open(ACTIVE_20, history([ENTRY], 3));

      (root().querySelector('nav button[aria-label="Go to page 2"]') as HTMLButtonElement).click();
      await settle();

      const request = httpMock.expectOne(isHistoryGet);
      expect(request.request.params.get('page')).toBe('2');
      expect(request.request.params.get('pageSize')).toBe('20');
      request.flush(history([{ ...ENTRY, id: 'h-2' }], 3));
      await settle();
    });
  });
});
