import { ApiError } from '../../../core/http/error.interceptor';
import { notConfiguredMessageKey } from '../../../core/http/provider-errors';
import {
  type RejectedTeachingMaterialFile,
  TEACHING_MATERIAL_MAX_BYTES,
  TEACHING_MATERIAL_MAX_PER_PARENT,
  formatFileSize,
} from './teaching-materials-rules';

/** A translatable message: resolve it with `translate` / `TranslationService.t(key, params)` at render time. */
export interface TeachingMaterialMessage {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

const GENERIC: TeachingMaterialMessage = { key: 'teachingMaterials.error.generic' };

/** The server's own reason for a 400 (`errorCode: validation`): its ProblemDetails `title` is Thai text meant for display. */
function validationReason(error: ApiError): string | null {
  if (error.code !== 'validation' || typeof error.details !== 'object' || error.details === null) {
    return null;
  }
  const title: unknown = (error.details as { readonly title?: unknown }).title;
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : null;
}

/**
 * Turns a failed teaching-material call (upload, delete, list or download) into a message the user can act on, following the
 * `errorCode` table in docs/contracts/P4-03c-teaching-materials-r2.md §4.4. Never echoes a raw English server title: the only
 * server text shown is the 400 `validation` reason, which the API writes in Thai for exactly this purpose.
 */
export function teachingMaterialErrorMessage(error: unknown): TeachingMaterialMessage {
  if (!(error instanceof ApiError)) {
    return GENERIC;
  }
  // 503 `attachment.virus_scanner_not_configured` / `storage.provider_not_configured` (and any future `*_not_configured`).
  const notConfigured = notConfiguredMessageKey(error);
  if (notConfigured) {
    return { key: notConfigured };
  }
  switch (error.status) {
    case 0:
      return { key: 'teachingMaterials.error.network' };
    case 400: {
      const reason = validationReason(error);
      return reason ? { key: 'teachingMaterials.error.rejected', params: { reason } } : { key: 'teachingMaterials.error.rejectedNoReason' };
    }
    case 401:
      return { key: 'teachingMaterials.error.signedOut' };
    case 403:
      return { key: 'teachingMaterials.error.forbidden' };
    case 404:
      return { key: 'teachingMaterials.error.notFound' };
    case 409:
      return { key: 'teachingMaterials.error.conflict' };
    case 413:
      return { key: 'teachingMaterials.error.tooLarge' };
    case 429:
      return { key: 'teachingMaterials.error.tooManyRequests' };
    case 503:
      return { key: 'teachingMaterials.error.unavailable' };
    default:
      return GENERIC;
  }
}

/** Why the pre-check turned a picked file away (`type` / `empty` / `tooLarge` / `limit`), naming the file and the limit. */
export function teachingMaterialRejectionMessage(file: RejectedTeachingMaterialFile): TeachingMaterialMessage {
  return {
    key: `teachingMaterials.reject.${file.reason}`,
    params: { name: file.name, size: formatFileSize(TEACHING_MATERIAL_MAX_BYTES), max: TEACHING_MATERIAL_MAX_PER_PARENT },
  };
}
