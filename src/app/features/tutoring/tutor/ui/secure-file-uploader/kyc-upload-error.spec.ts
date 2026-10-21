import { ApiError } from '../../../../../core/http/error.interceptor';
import { TUTORING_EN as en, TUTORING_TH as th } from '../../../testing/tutoring-i18n';
import { kycFileRejectionOf, kycUploadErrorKey } from './kyc-upload-error';

function problem(status: number, reason?: string, extra: object = {}): ApiError {
  return new ApiError(status, 'x', 'validation', { status, reason, ...extra });
}

function hasKey(dictionary: unknown, key: string): boolean {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary) !== undefined;
}

describe('kycUploadErrorKey', () => {
  const rejected = (detail?: unknown): ApiError => problem(400, 'tutoring.kyc.file_rejected', { detail, title: 'SERVER SIDE TEXT' });

  it.each([
    ['size', 'tutoring.kyc.upload.errorSize'],
    ['type', 'tutoring.kyc.upload.errorType'],
    ['signature', 'tutoring.kyc.upload.errorSignature'],
    ['active_content', 'tutoring.kyc.upload.errorActiveContent'],
  ])('reads the category %s from the standard problem detail and maps it to %s, which exists in both dictionaries', (detail, key) => {
    expect(kycFileRejectionOf(rejected(detail))).toBe(detail);
    expect(kycUploadErrorKey(rejected(detail))).toBe(key);
    expect(hasKey(th, key)).toBe(true);
    expect(hasKey(en, key)).toBe(true);
  });

  it('falls back to the general file-rejected text when the category is missing, unknown or not a string', () => {
    for (const bad of [undefined, 'something_new', '', 7, null, '__proto__', 'constructor']) {
      expect(kycFileRejectionOf(rejected(bad))).toBeNull();
      expect(kycUploadErrorKey(rejected(bad))).toBe('tutoring.errors.kyc.fileRejected');
    }
  });

  it('only trusts the category of a file_rejected problem, never of another reason', () => {
    const other = problem(409, 'tutoring.kyc.case_open', { detail: 'size' });
    expect(kycFileRejectionOf(other)).toBeNull();
    expect(kycUploadErrorKey(other)).toBe('tutoring.errors.kyc.caseOpen');
  });

  it('keeps the status-only answers: 413 (body over the limit) and 429 (rate limit) carry no reason', () => {
    expect(kycUploadErrorKey(new ApiError(413, 'x'))).toBe('tutoring.errors.fileTooLarge');
    expect(kycUploadErrorKey(new ApiError(429, 'x'))).toBe('tutoring.errors.rateLimited');
  });

  it('falls back to the generic message for a non-ApiError and for a failure without a body', () => {
    expect(kycUploadErrorKey(new Error('boom'))).toBe('tutoring.errors.generic');
    expect(kycUploadErrorKey(new ApiError(500, 'x'))).toBe('tutoring.errors.generic');
    expect(kycFileRejectionOf(new Error('boom'))).toBeNull();
  });
});
