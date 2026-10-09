import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { ToastService } from '../../../../shared/toast/toast.service';
import { InstructorPayoutAccount } from '../../../payout/data/payout-api.models';
import { PayoutAccountCard } from './payout-account-card';

registerLocaleData(localeTh);

const ACCOUNT_URL = '/api/payout/instructor/payout-account';

const VERIFIED: InstructorPayoutAccount = {
  id: 'account-1',
  instructorId: 'instructor-1',
  bankCode: 'KBANK',
  maskedAccountNo: '***-***-9999',
  accountName: 'Somchai Test',
  taxId: '***-***-3456',
  taxPayerType: 'Corporate',
  verifiedAtUtc: '2026-09-20T03:00:00Z',
};

const PENDING: InstructorPayoutAccount = { ...VERIFIED, verifiedAtUtc: null };

describe('PayoutAccountCard', () => {
  let fixture: ComponentFixture<PayoutAccountCard>;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(PayoutAccountCard);
    await settle();
  });

  afterEach(() => httpMock.verify());

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  async function respondGet(body: InstructorPayoutAccount | null, status = 200): Promise<void> {
    const req = httpMock.expectOne((r) => r.url === ACCOUNT_URL && r.method === 'GET');
    if (status === 200) {
      req.flush(body);
    } else {
      req.flush({ title: 'x' }, { status, statusText: 'Error' });
    }
    await settle();
  }

  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

  function control(label: string): HTMLInputElement | HTMLSelectElement {
    const match = Array.from(root().querySelectorAll('label')).find((l) => l.textContent?.trim().startsWith(label)) as HTMLLabelElement;
    return root().querySelector(`#${match.getAttribute('for')}`) as HTMLInputElement | HTMLSelectElement;
  }

  async function type(label: string, value: string): Promise<void> {
    const input = control(label) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function choose(label: string, value: string): Promise<void> {
    const select = control(label) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    select.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function submit(): Promise<void> {
    (root().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  function expectPut(): TestRequest {
    return httpMock.expectOne((r) => r.url === ACCOUNT_URL && r.method === 'PUT');
  }

  async function fillValidForm(): Promise<void> {
    await choose('Bank', 'SCB');
    await type('Account number', '123-4-56789-0');
    await type('Account name', '  Somchai Test  ');
  }

  it('shows a loading placeholder (no fabricated account) until the GET resolves', async () => {
    expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(text()).not.toContain('KBANK');
    expect(text()).not.toContain('Kasikornbank');
    await respondGet(VERIFIED);
    expect(root().querySelector('[aria-busy="true"]')).toBeNull();
  });

  describe('GET /api/payout/instructor/payout-account', () => {
    it('treats 404 as "no account yet": an empty state with an add button, not a load error', async () => {
      await respondGet(null, 404);

      expect(text()).toContain('No payout account yet');
      expect(text()).not.toContain("Couldn't load bank account details");
      expect(button('Add payout account')).toBeTruthy();
    });

    it('shows a real error state with retry for any other failure, and retry re-fetches', async () => {
      await respondGet(null, 500);

      expect(text()).toContain("Couldn't load bank account details");
      expect(text()).not.toContain('No payout account yet');
      expect(button('Add payout account')).toBeUndefined();

      button('Try again')?.click();
      await settle();
      await respondGet(PENDING);

      expect(text()).toContain('Somchai Test');
    });

    it('shows the saved account exactly as the backend masked it, with the verified status in text', async () => {
      await respondGet(VERIFIED);

      expect(text()).toContain('Kasikornbank (KBANK)');
      expect(text()).toContain('***-***-9999');
      expect(text()).toContain('Somchai Test');
      expect(text()).toContain('Juristic person');
      expect(text()).toContain('***-***-3456');
      expect(text()).toContain('Verified');
      expect(text()).toContain('20 Sep 2026');
      expect(text()).not.toContain('Awaiting admin verification');
      expect(button('Edit account')).toBeTruthy();
    });

    it('shows "awaiting admin verification" (text, not colour alone) while verifiedAtUtc is null', async () => {
      await respondGet(PENDING);

      expect(text()).toContain('Awaiting admin verification');
      expect(text()).toContain('An admin must verify this account');
      expect(text()).not.toContain('Verified');
    });

    it('shows a bank code the list does not know as-is', async () => {
      await respondGet({ ...PENDING, bankCode: 'XYZBANK' });
      expect(text()).toContain('XYZBANK');
    });
  });

  describe('adding an account (no account yet)', () => {
    beforeEach(async () => {
      await respondGet(null, 404);
      button('Add payout account')?.click();
      await settle();
    });

    it('opens the form with the re-verification notice and no pre-filled secrets', async () => {
      expect(text()).toContain('Awaiting admin verification');
      expect((control('Account number') as HTMLInputElement).value).toBe('');
      expect((control('Tax ID') as HTMLInputElement).value).toBe('');
    });

    it('refuses an empty submit: inline errors next to the fields, an error summary, and no request', async () => {
      await submit();

      httpMock.expectNone(ACCOUNT_URL);
      expect(root().querySelector('[role="alert"]')).not.toBeNull();
      expect(text()).toContain("There's a problem with this form");
      expect(root().querySelectorAll('p[role="alert"]').length).toBeGreaterThanOrEqual(3);
    });

    it('rejects a non-numeric or too-short account number without calling the API', async () => {
      await choose('Bank', 'SCB');
      await type('Account name', 'Somchai Test');

      await type('Account number', '12ab5678');
      await submit();
      expect(text()).toContain('digits only');
      httpMock.expectNone(ACCOUNT_URL);

      await type('Account number', '1234');
      await submit();
      httpMock.expectNone(ACCOUNT_URL);
      expect(text()).toContain('at least 8');
    });

    it('PUTs exactly {bankCode, accountNo, accountName, taxId, taxPayerType} with separators stripped, names trimmed and a blank tax id as null', async () => {
      await fillValidForm();
      await submit();

      const req = expectPut();
      expect(req.request.body).toEqual({
        bankCode: 'SCB',
        accountNo: '1234567890',
        accountName: 'Somchai Test',
        taxId: null,
        taxPayerType: 'Individual',
      });
      req.flush({ ...PENDING, bankCode: 'SCB', maskedAccountNo: '***-***-7890', taxId: null, taxPayerType: 'Individual' });
    });

    it('sends the tax payer type and the trimmed tax id when given', async () => {
      await fillValidForm();
      await choose('Taxpayer type', 'Corporate');
      await type('Tax ID', ' 0105551234567 ');
      await submit();

      const req = expectPut();
      expect(req.request.body).toMatchObject({ taxId: '0105551234567', taxPayerType: 'Corporate' });
      req.flush(PENDING);
    });

    it('replaces the form with the server-confirmed masked account, shows pending verification and toasts success', async () => {
      await fillValidForm();
      await submit();
      expectPut().flush({ ...PENDING, bankCode: 'SCB', maskedAccountNo: '***-***-7890', accountName: 'Somchai Test', taxId: null });
      await settle();

      expect(root().querySelector('form')).toBeNull();
      expect(text()).toContain('Siam Commercial Bank (SCB)');
      expect(text()).toContain('***-***-7890');
      expect(text()).toContain('Awaiting admin verification');
      expect(text()).not.toContain('1234567890');
      expect(toast.toasts().some((t) => t.type === 'success')).toBe(true);
      expect(button('Edit account')).toBeTruthy();
    });

    it('guards against a double submit: the second submit while the first is in flight sends nothing', async () => {
      await fillValidForm();
      await submit();
      await submit();

      const req = expectPut();
      req.flush(PENDING);
    });

    it('403 (not an approved instructor): a clear message, the form and what was typed stay', async () => {
      await fillValidForm();
      await submit();
      expectPut().flush({ title: 'Forbidden', detail: 'raw backend text' }, { status: 403, statusText: 'Forbidden' });
      await settle();

      expect(text()).toContain('only approved instructors can add a payout account');
      expect(text()).not.toContain('raw backend text');
      expect(root().querySelector('form')).not.toBeNull();
      expect((control('Account name') as HTMLInputElement).value).toBe('  Somchai Test  ');
    });

    it('409: a clear conflict message and a usable form', async () => {
      await fillValidForm();
      await submit();
      expectPut().flush({ title: 'Conflict' }, { status: 409, statusText: 'Conflict' });
      await settle();

      expect(text()).toContain('changed from somewhere else');
      expect(root().querySelector('form')).not.toBeNull();
    });

    it('any other failure: a generic message and the form stays', async () => {
      await fillValidForm();
      await submit();
      expectPut().flush({ title: 'boom' }, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text()).toContain("Couldn't save the payout account");
      expect(root().querySelector('form')).not.toBeNull();
    });

    it('400 field errors are shown next to the fields (translated), not in the summary, and clear when the value is edited', async () => {
      await fillValidForm();
      await submit();
      expectPut().flush(
        {
          title: 'One or more validation errors occurred.',
          status: 400,
          errors: { AccountNo: ["'Account No' must not be empty."], TaxId: ["'Tax Id' must be 20 characters or fewer."] },
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      const fieldErrors = Array.from(root().querySelectorAll('p[role="alert"]')).map((p) => p.textContent?.trim());
      expect(fieldErrors).toContain('The account number is not valid — please check it');
      expect(fieldErrors).toContain('The tax ID is not valid — please check it');
      expect(text()).not.toContain('must not be empty');
      expect(text()).not.toContain('The submitted details are not valid');

      await type('Account number', '1234567890');
      expect(text()).not.toContain('The account number is not valid');
    });

    it('a 400 that flags no known field falls back to the generic invalid message', async () => {
      await fillValidForm();
      await submit();
      expectPut().flush({ title: 'bad', status: 400 }, { status: 400, statusText: 'Bad Request' });
      await settle();

      expect(text()).toContain('The submitted details are not valid');
    });

    it('cancel closes the form and discards what was typed', async () => {
      await fillValidForm();
      button('Cancel')?.click();
      await settle();

      expect(root().querySelector('form')).toBeNull();
      button('Add payout account')?.click();
      await settle();
      expect((control('Account number') as HTMLInputElement).value).toBe('');
      httpMock.expectNone(ACCOUNT_URL);
    });
  });

  describe('editing a saved account', () => {
    beforeEach(async () => {
      await respondGet(VERIFIED);
      button('Edit account')?.click();
      await settle();
    });

    it('pre-fills only the non-secret fields, leaves account number / tax id empty, and warns about re-verification', async () => {
      expect((control('Bank') as HTMLSelectElement).value).toBe('KBANK');
      expect((control('Account name') as HTMLInputElement).value).toBe('Somchai Test');
      expect((control('Taxpayer type') as HTMLSelectElement).value).toBe('Corporate');
      expect((control('Account number') as HTMLInputElement).value).toBe('');
      expect((control('Tax ID') as HTMLInputElement).value).toBe('');
      expect(text()).toContain('sets the account back to "Awaiting admin verification"');
      expect(text()).toContain('enter them again every time you save');
    });

    it('requires the account number again before saving, then shows the response (back to pending)', async () => {
      await submit();
      httpMock.expectNone(ACCOUNT_URL);

      await type('Account number', '9876543210');
      await submit();

      const req = expectPut();
      expect(req.request.body).toEqual({
        bankCode: 'KBANK',
        accountNo: '9876543210',
        accountName: 'Somchai Test',
        taxId: null,
        taxPayerType: 'Corporate',
      });
      req.flush({ ...PENDING, maskedAccountNo: '***-***-3210' });
      await settle();

      expect(text()).toContain('***-***-3210');
      expect(text()).toContain('Awaiting admin verification');
    });
  });
});
