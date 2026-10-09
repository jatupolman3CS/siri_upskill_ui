import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

import { TaxPayerType, UpsertPayoutAccountRequest } from '../../../payout/data/payout-api.models';

/** Mirrors `CreateInstructorPayoutAccountValidator` (backend): the length caps the server enforces. */
export const ACCOUNT_NO_MAX_LENGTH = 34;
export const ACCOUNT_NAME_MAX_LENGTH = 200;
export const TAX_ID_MAX_LENGTH = 20;
/** Client-only lower bound (not a server rule): below this a bank account number is clearly mistyped. */
export const ACCOUNT_NO_MIN_LENGTH = 8;

export const TAX_PAYER_TYPES: readonly TaxPayerType[] = ['Individual', 'Corporate'];

/** People type account numbers as `123-4-56789-0` or with spaces; the server stores and exports the bare digits. */
export function normalizeAccountNo(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/** Required (when `required`) and `maxLength` measured on the trimmed value — the same string that is sent. */
export function trimmedText(options: { readonly required: boolean; readonly max: number }): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (value === '') {
      return options.required ? { required: true } : null;
    }
    return value.length > options.max ? { maxlength: { requiredLength: options.max, actualLength: value.length } } : null;
  };
}

/** Bank account number: digits only once separators are stripped, within the length bounds. */
export const accountNoValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = normalizeAccountNo(String(control.value ?? ''));
  if (value === '') {
    return { required: true };
  }
  if (!/^\d+$/.test(value)) {
    return { digits: true };
  }
  if (value.length < ACCOUNT_NO_MIN_LENGTH) {
    return { minlength: { requiredLength: ACCOUNT_NO_MIN_LENGTH, actualLength: value.length } };
  }
  if (value.length > ACCOUNT_NO_MAX_LENGTH) {
    return { maxlength: { requiredLength: ACCOUNT_NO_MAX_LENGTH, actualLength: value.length } };
  }
  return null;
};

export interface PayoutAccountFormValue {
  readonly bankCode: string;
  readonly accountNo: string;
  readonly accountName: string;
  readonly taxId: string;
  readonly taxPayerType: TaxPayerType;
}

/** The exact body sent to `PUT /api/payout/instructor/payout-account`. A blank tax id is sent as `null`, never `""`. */
export function buildUpsertRequest(value: PayoutAccountFormValue): UpsertPayoutAccountRequest {
  const taxId = value.taxId.trim();
  return {
    bankCode: value.bankCode,
    accountNo: normalizeAccountNo(value.accountNo),
    accountName: value.accountName.trim(),
    taxId: taxId === '' ? null : taxId,
    taxPayerType: value.taxPayerType,
  };
}
