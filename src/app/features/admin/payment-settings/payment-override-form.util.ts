import { AbstractControl, ValidationErrors } from '@angular/forms';

import { ApiError } from '../../../core/http/error.interceptor';
import { fieldError } from '../../auth/data/field-error.util';

/** Mirrors the backend rules (amount: `> 0`, `<= 2,000,000`, at most 2 decimals; reason: required, 3..500 characters). */
export const OVERRIDE_MAX_AMOUNT = 2_000_000;
export const OVERRIDE_MAX_DECIMALS = 2;
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

/** Accepts what `<input type="number">` can hand back: `20`, `20.5`, `20.`, `.5`, `-5`. Exponents and separators are rejected. */
const AMOUNT_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/;

/**
 * Validator for the amount field (the control holds the raw text). An empty value is left to `Validators.required` so the
 * two failures never show at once. Decimals are counted without trailing zeros, so `20.500` is accepted like `20.5`.
 */
export function amountValidator(control: AbstractControl<string>): ValidationErrors | null {
  const raw = control.value.trim();
  if (raw === '') {
    return null;
  }
  if (!AMOUNT_PATTERN.test(raw)) {
    return { amountInvalid: true };
  }
  const fraction = raw.split('.')[1]?.replace(/0+$/, '') ?? '';
  if (fraction.length > OVERRIDE_MAX_DECIMALS) {
    return { amountDecimals: true };
  }
  const amount = Number(raw);
  if (amount <= 0) {
    return { amountMin: true };
  }
  if (amount > OVERRIDE_MAX_AMOUNT) {
    return { amountMax: true };
  }
  return null;
}

/** The numeric amount to send, or `null` when the raw text is empty or not a valid amount (`amountValidator` says why). */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || amountValidator({ value: trimmed } as AbstractControl<string>) !== null) {
    return null;
  }
  return Number(trimmed);
}

/** The reason is judged on its trimmed length, which is also exactly what gets sent. Empty is left to `Validators.required`. */
export function reasonValidator(control: AbstractControl<string>): ValidationErrors | null {
  const raw = control.value;
  if (raw === '') {
    return null;
  }
  const length = raw.trim().length;
  if (length === 0) {
    return { reasonBlank: true };
  }
  if (length < REASON_MIN_LENGTH) {
    return { reasonShort: true };
  }
  return length > REASON_MAX_LENGTH ? { reasonLong: true } : null;
}

/** i18n key (under `admin.paymentSettings.form.errors`) for the first failing rule, or `null` when valid. */
export function formErrorKey(errors: ValidationErrors | null): string | null {
  if (!errors) {
    return null;
  }
  if (errors['required'] || errors['reasonBlank']) {
    return 'required';
  }
  for (const code of ['amountInvalid', 'amountDecimals', 'amountMin', 'amountMax', 'reasonShort', 'reasonLong']) {
    if (errors[code]) {
      return code;
    }
  }
  return null;
}

/**
 * The server's message for one request property. The contract keys field errors in camelCase; the older FluentValidation
 * endpoints use PascalCase, so both spellings are tried instead of trusting one.
 */
export function serverFieldError(apiError: ApiError | null, property: 'overrideAmount' | 'reason'): string | undefined {
  return fieldError(apiError, property) ?? fieldError(apiError, property.charAt(0).toUpperCase() + property.slice(1));
}

/** i18n key for a failed save that is not about one field (field errors are shown next to their field instead). */
export function saveErrorKey(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'common.error';
  }
  if (error.status === 401 || error.status === 403) {
    return 'admin.paymentSettings.errors.forbidden';
  }
  return error.status === 400 ? 'admin.paymentSettings.errors.invalid' : 'common.error';
}

/** First 8 characters of an id — enough to eyeball in a table; the full value stays available in `title` and for screen readers. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
