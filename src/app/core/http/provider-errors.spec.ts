import { throwError } from 'rxjs';

import { ApiError } from './error.interceptor';
import { notConfiguredMessageKey, restoreBlobProblem } from './provider-errors';

describe('notConfiguredMessageKey', () => {
  it.each([
    ['receipt.seller_not_configured', 'common.notConfigured.receiptSeller'],
    ['certificate.public_url_not_configured', 'common.notConfigured.certificatePublicUrl'],
    ['payout.payer_not_configured', 'common.notConfigured.payoutPayer'],
    ['attachment.virus_scanner_not_configured', 'common.notConfigured.attachmentScanner'],
    ['payment.provider_not_configured', 'common.notConfigured.paymentProvider'],
    ['video.provider_not_configured', 'common.notConfigured.videoProvider'],
  ])('maps %s to its own message', (code, key) => {
    expect(notConfiguredMessageKey(new ApiError(503, 'Some English title.', code))).toBe(key);
  });

  it('falls back to the generic message for an unknown code that follows the _not_configured convention', () => {
    expect(notConfiguredMessageKey(new ApiError(503, 't', 'email.provider_not_configured'))).toBe('common.notConfigured.generic');
    expect(notConfiguredMessageKey(new ApiError(503, 't', 'google.not_configured'))).toBe('common.notConfigured.generic');
  });

  it('ignores everything that is not a 503 not-configured failure', () => {
    expect(notConfiguredMessageKey(new ApiError(400, 't', 'payment.provider_not_configured'))).toBeNull();
    expect(notConfiguredMessageKey(new ApiError(503, 't', 'unavailable'))).toBeNull();
    expect(notConfiguredMessageKey(new ApiError(503, 't'))).toBeNull();
    expect(notConfiguredMessageKey(new Error('boom'))).toBeNull();
    expect(notConfiguredMessageKey(null)).toBeNull();
  });
});

describe('restoreBlobProblem', () => {
  function run(error: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      throwError(() => error)
        .pipe(restoreBlobProblem())
        .subscribe({ error: (e: unknown) => resolve(e) });
    });
  }

  it('recovers the errorCode that the interceptor could not read from a blob error body', async () => {
    const body = JSON.stringify({ title: 'Receipt seller details are not configured.', status: 503, errorCode: 'receipt.seller_not_configured' });
    const blobError = new ApiError(503, 'common.error', undefined, new Blob([body], { type: 'application/problem+json' }));

    const restored = await run(blobError);

    expect(restored).toBeInstanceOf(ApiError);
    expect((restored as ApiError).status).toBe(503);
    expect((restored as ApiError).code).toBe('receipt.seller_not_configured');
    expect(notConfiguredMessageKey(restored)).toBe('common.notConfigured.receiptSeller');
  });

  it('rethrows the original error when the blob is not a JSON problem body', async () => {
    const blobError = new ApiError(500, 'common.error', undefined, new Blob(['%PDF-not-json']));
    expect(await run(blobError)).toBe(blobError);
  });

  it('passes through errors that carry no blob', async () => {
    const plain = new ApiError(503, 'x', 'video.provider_not_configured', { errorCode: 'video.provider_not_configured' });
    expect(await run(plain)).toBe(plain);
    const other = new Error('network');
    expect(await run(other)).toBe(other);
  });
});
