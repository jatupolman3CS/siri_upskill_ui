import type { EpisodeAttachmentDownloadInfo, EpisodeAttachmentItem } from '../../learning/data/learning-api.models';

/**
 * Teaching materials (P4-03c, docs/contracts/P4-03c-teaching-materials-r2.md §4): documents an instructor attaches to one
 * video episode or to one live session. The two endpoint families answer with near-identical DTOs; `kind` picks the family.
 */
export type TeachingMaterialKind = 'episode' | 'session';

/** `LiveSessionAttachmentResponse` — the contract's live-session twin of {@link EpisodeAttachmentItem}. */
export interface LiveSessionAttachment {
  readonly id: string;
  readonly sessionId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAtUtc: string;
}

/** `LiveSessionAttachmentDownloadResponse`. `downloadUrl` is a short-lived signed URL: use it at once, never store it. */
export interface LiveSessionAttachmentDownload {
  readonly id: string;
  readonly sessionId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly downloadUrl: string;
  readonly expiresAtUtc: string;
}

/** What both families have in common, so one list / panel can render either. */
export type TeachingMaterial = Pick<
  EpisodeAttachmentItem | LiveSessionAttachment,
  'id' | 'fileName' | 'contentType' | 'sizeBytes' | 'createdAtUtc'
>;

export type TeachingMaterialDownload = Pick<
  EpisodeAttachmentDownloadInfo | LiveSessionAttachmentDownload,
  'id' | 'fileName' | 'contentType' | 'sizeBytes' | 'downloadUrl' | 'expiresAtUtc'
>;

/** Emitted while a file is being uploaded: `percent` is 0–100 of the request body sent, then `done` carries the stored file. */
export type TeachingMaterialUploadEvent =
  | { readonly type: 'progress'; readonly percent: number }
  | { readonly type: 'done'; readonly material: TeachingMaterial };
