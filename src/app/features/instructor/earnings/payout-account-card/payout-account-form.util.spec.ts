import { FormControl } from '@angular/forms';

import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NO_MAX_LENGTH,
  TAX_ID_MAX_LENGTH,
  accountNoValidator,
  buildUpsertRequest,
  normalizeAccountNo,
  trimmedText,
} from './payout-account-form.util';

describe('payout-account-form.util', () => {
  describe('normalizeAccountNo', () => {
    it('strips spaces and dashes only', () => {
      expect(normalizeAccountNo(' 123-4-56789 0 ')).toBe('1234567890');
      expect(normalizeAccountNo('12ab')).toBe('12ab');
    });
  });

  describe('accountNoValidator', () => {
    const run = (value: string) => accountNoValidator(new FormControl(value));

    it('accepts digits with separators within bounds', () => {
      expect(run('123-4-56789-0')).toBeNull();
      expect(run('1'.repeat(ACCOUNT_NO_MAX_LENGTH))).toBeNull();
    });

    it('flags empty, non-digit, too short and too long values', () => {
      expect(run('')).toEqual({ required: true });
      expect(run(' - ')).toEqual({ required: true });
      expect(run('12ab5678')).toEqual({ digits: true });
      expect(run('1234567')).toEqual({ minlength: { requiredLength: 8, actualLength: 7 } });
      expect(run('1'.repeat(ACCOUNT_NO_MAX_LENGTH + 1))).toEqual({
        maxlength: { requiredLength: ACCOUNT_NO_MAX_LENGTH, actualLength: ACCOUNT_NO_MAX_LENGTH + 1 },
      });
    });
  });

  describe('trimmedText', () => {
    it('measures the trimmed value against the backend caps', () => {
      const name = trimmedText({ required: true, max: ACCOUNT_NAME_MAX_LENGTH });
      expect(name(new FormControl('   '))).toEqual({ required: true });
      expect(name(new FormControl(`  ${'a'.repeat(ACCOUNT_NAME_MAX_LENGTH)}  `))).toBeNull();
      expect(name(new FormControl('a'.repeat(ACCOUNT_NAME_MAX_LENGTH + 1)))).not.toBeNull();
    });

    it('treats an optional field as valid when blank', () => {
      const taxId = trimmedText({ required: false, max: TAX_ID_MAX_LENGTH });
      expect(taxId(new FormControl('  '))).toBeNull();
      expect(taxId(new FormControl('1'.repeat(TAX_ID_MAX_LENGTH + 1)))).not.toBeNull();
    });
  });

  describe('buildUpsertRequest', () => {
    it('builds the backend command shape, with a blank tax id as null and never an empty string', () => {
      expect(
        buildUpsertRequest({ bankCode: 'KBANK', accountNo: '123-4-56789-0', accountName: ' A B ', taxId: '   ', taxPayerType: 'Individual' }),
      ).toEqual({ bankCode: 'KBANK', accountNo: '1234567890', accountName: 'A B', taxId: null, taxPayerType: 'Individual' });
    });

    it('trims a provided tax id', () => {
      expect(
        buildUpsertRequest({ bankCode: 'SCB', accountNo: '1234567890', accountName: 'X', taxId: ' 0105551234567 ', taxPayerType: 'Corporate' }).taxId,
      ).toBe('0105551234567');
    });
  });
});
