import { ApiError } from '../../../core/http/error.interceptor';
import { teachingMaterialErrorMessage, teachingMaterialRejectionMessage } from './teaching-materials-errors';

describe('teachingMaterialErrorMessage', () => {
  it('shows the server reason of a 400 validation error (its title is Thai text written for display)', () => {
    const error = new ApiError(400, 'detail', 'validation', { title: ' ไฟล์ใหญ่เกิน 50 MB ', errorCode: 'validation' });
    expect(teachingMaterialErrorMessage(error)).toEqual({ key: 'teachingMaterials.error.rejected', params: { reason: 'ไฟล์ใหญ่เกิน 50 MB' } });
  });

  it('does not echo an English framework title for a 400 that is not the domain validation error', () => {
    const problem = { title: 'One or more validation errors occurred.', errors: { file: ['required'] } };
    expect(teachingMaterialErrorMessage(new ApiError(400, problem.title, undefined, problem))).toEqual({
      key: 'teachingMaterials.error.rejectedNoReason',
    });
    expect(teachingMaterialErrorMessage(new ApiError(400, 'x', 'validation', { title: '   ' }))).toEqual({
      key: 'teachingMaterials.error.rejectedNoReason',
    });
  });

  it.each([
    [503, 'attachment.virus_scanner_not_configured', 'common.notConfigured.attachmentScanner'],
    [503, 'storage.provider_not_configured', 'common.notConfigured.storageProvider'],
    [503, 'unavailable', 'teachingMaterials.error.unavailable'],
    [503, undefined, 'teachingMaterials.error.unavailable'],
    [401, undefined, 'teachingMaterials.error.signedOut'],
    [403, 'forbidden', 'teachingMaterials.error.forbidden'],
    [404, 'not_found', 'teachingMaterials.error.notFound'],
    [409, 'conflict', 'teachingMaterials.error.conflict'],
    [413, undefined, 'teachingMaterials.error.tooLarge'],
    [429, undefined, 'teachingMaterials.error.tooManyRequests'],
    [0, undefined, 'teachingMaterials.error.network'],
    [500, undefined, 'teachingMaterials.error.generic'],
  ])('maps HTTP %s (%s) to %s', (status, code, key) => {
    expect(teachingMaterialErrorMessage(new ApiError(status, 'Some English title', code)).key).toBe(key);
  });

  it('falls back to the generic message for anything that is not an ApiError', () => {
    expect(teachingMaterialErrorMessage(new Error('boom'))).toEqual({ key: 'teachingMaterials.error.generic' });
    expect(teachingMaterialErrorMessage(null)).toEqual({ key: 'teachingMaterials.error.generic' });
  });
});

describe('teachingMaterialRejectionMessage', () => {
  it.each(['type', 'empty', 'tooLarge', 'limit'] as const)('names the file and the limits for a %s rejection', (reason) => {
    expect(teachingMaterialRejectionMessage({ name: 'a.pdf', reason })).toEqual({
      key: `teachingMaterials.reject.${reason}`,
      params: { name: 'a.pdf', size: '50 MB', max: 30 },
    });
  });
});
