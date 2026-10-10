import { AbstractControl } from '@angular/forms';

import { ApiError } from '../../../core/http/error.interceptor';
import {
  amountValidator,
  formErrorKey,
  parseAmount,
  reasonValidator,
  saveErrorKey,
  serverFieldError,
  shortId,
} from './payment-override-form.util';

const control = (value: string) => ({ value }) as AbstractControl<string>;

describe('amountValidator', () => {
  it.each(['20', '20.5', '20.50', '20.', '.5', '0.01', '1999999.99', '2000000', '20.500'])('accepts %s', (raw) => {
    expect(amountValidator(control(raw))).toBeNull();
  });

  it('leaves an empty value to Validators.required', () => {
    expect(amountValidator(control(''))).toBeNull();
    expect(amountValidator(control('   '))).toBeNull();
  });

  it.each([
    ['0', 'amountMin'],
    ['0.00', 'amountMin'],
    ['-5', 'amountMin'],
    ['2000000.01', 'amountMax'],
    ['2000001', 'amountMax'],
    ['20.123', 'amountDecimals'],
    ['1e3', 'amountInvalid'],
    ['abc', 'amountInvalid'],
    ['1,000', 'amountInvalid'],
  ])('rejects %s with %s', (raw, code) => {
    expect(amountValidator(control(raw))).toEqual({ [code]: true });
  });
});

describe('parseAmount', () => {
  it('returns the number for a valid amount, trimmed', () => {
    expect(parseAmount(' 20.5 ')).toBe(20.5);
  });

  it('returns null for empty or invalid text', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('20.123')).toBeNull();
  });
});

describe('reasonValidator', () => {
  it('judges the trimmed length: 3..500', () => {
    expect(reasonValidator(control('abc'))).toBeNull();
    expect(reasonValidator(control('  abc  '))).toBeNull();
    expect(reasonValidator(control('a'.repeat(500)))).toBeNull();
    expect(reasonValidator(control('  ab  '))).toEqual({ reasonShort: true });
    expect(reasonValidator(control('a'.repeat(501)))).toEqual({ reasonLong: true });
  });

  it('flags whitespace-only text but leaves empty to Validators.required', () => {
    expect(reasonValidator(control('   '))).toEqual({ reasonBlank: true });
    expect(reasonValidator(control(''))).toBeNull();
  });
});

describe('formErrorKey', () => {
  it('maps required and blank to "required", other codes to themselves, and valid to null', () => {
    expect(formErrorKey({ required: true })).toBe('required');
    expect(formErrorKey({ reasonBlank: true })).toBe('required');
    expect(formErrorKey({ amountMax: true })).toBe('amountMax');
    expect(formErrorKey({ reasonShort: true })).toBe('reasonShort');
    expect(formErrorKey(null)).toBeNull();
  });
});

describe('serverFieldError', () => {
  const error = (errors: Record<string, string[]>) => new ApiError(400, 'Validation', undefined, { errors });

  it('reads the camelCase key the contract promises', () => {
    expect(serverFieldError(error({ overrideAmount: ['too big'] }), 'overrideAmount')).toBe('too big');
  });

  it('falls back to the PascalCase key older endpoints use', () => {
    expect(serverFieldError(error({ Reason: ['too short'] }), 'reason')).toBe('too short');
  });

  it('is undefined for no error, another field, or a non-validation failure', () => {
    expect(serverFieldError(null, 'reason')).toBeUndefined();
    expect(serverFieldError(error({ reason: ['x'] }), 'overrideAmount')).toBeUndefined();
    expect(serverFieldError(new ApiError(500, 'boom'), 'reason')).toBeUndefined();
  });
});

describe('saveErrorKey', () => {
  it('maps 401/403 to forbidden, 400 to invalid and everything else to the generic error', () => {
    expect(saveErrorKey(new ApiError(403, 'x'))).toBe('admin.paymentSettings.errors.forbidden');
    expect(saveErrorKey(new ApiError(401, 'x'))).toBe('admin.paymentSettings.errors.forbidden');
    expect(saveErrorKey(new ApiError(400, 'x'))).toBe('admin.paymentSettings.errors.invalid');
    expect(saveErrorKey(new ApiError(500, 'x'))).toBe('common.error');
    expect(saveErrorKey(new Error('network'))).toBe('common.error');
  });
});

describe('shortId', () => {
  it('shortens long ids to 8 characters and leaves short ones alone', () => {
    expect(shortId('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe('0190a1b2');
    expect(shortId('u-1')).toBe('u-1');
  });
});
