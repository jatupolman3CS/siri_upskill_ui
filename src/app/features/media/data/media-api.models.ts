export type MediaAssetStatus = 'Uploading' | 'Processing' | 'Ready' | 'Failed';

export interface CreateMediaAssetCommand {
  readonly title: string;
}

export interface MediaAssetResponse {
  readonly id: string;
  readonly provider: string;
  readonly providerAssetId: string;
  readonly playbackId: string | null;
  readonly status: MediaAssetStatus;
  readonly durationSeconds: number | null;
  readonly drmEnabled: boolean;
  readonly thumbnailUrl: string | null;
  readonly uploadedByUserId: string;
  readonly readyAtUtc: string | null;
  readonly errorMessage: string | null;
  readonly createdAtUtc: string;
}

export interface MediaUploadSessionResponse {
  readonly id: string;
  readonly mediaAssetId: string;
  readonly uploadUrl: string;
  readonly expiresAtUtc: string;
  readonly status: string;
  readonly createdAtUtc: string;
}
