import type {
  GoogleAccountKind,
  RecordingCapability,
  RecordingImportInfo,
  RecordingImportStatus,
} from './live-instructor.models';
import type { StatusTone, StatusView } from './live-instructor.util';
import type { LiveDisplayState } from './live.models';

/**
 * Pure UI decisions for the recording-import feature (contract `P11-13` §8). Everything here maps what the server already
 * decided (`recordingImport.status`, `canRetry`, `recording.mode`) to wording and controls — the UI never works out for itself
 * whether an import is due, allowed to retry, or finished.
 */

/** Polling cadence while a recording is being imported (the job itself runs every 5 minutes, so faster is pointless). */
export const RECORDING_IMPORT_POLL_MS = 30_000;

const IN_FLIGHT: readonly RecordingImportStatus[] = ['Waiting', 'Transferring', 'Processing'];

/** The import is running by itself — nothing for the instructor to do but wait. */
export function isRecordingImportInFlight(status: RecordingImportStatus | null | undefined): boolean {
  return status != null && IN_FLIGHT.includes(status);
}

interface ImportItem {
  readonly displayState: LiveDisplayState;
  readonly recordingImport?: RecordingImportInfo | null;
}

/** True while at least one ended session is being imported — the only condition under which a list polls for it. */
export function hasInFlightRecordingImport(items: readonly ImportItem[]): boolean {
  return items.some((item) => item.displayState === 'Ended' && isRecordingImportInFlight(item.recordingImport?.status));
}

// --- Session row / detail: the recording block ----------------------------------------------------------------------------

/**
 * `attached`/`manual` keep each surface's own existing sentence (the builder row and the detail page word them differently),
 * so they carry no `textKey` here; every other kind has a sentence of its own under `live.recordingImport.status.*`.
 */
export type RecordingBlockKind = 'attached' | 'manual' | 'importing' | 'noRecording' | 'failed' | 'needsReconnect';

export interface RecordingBlockView {
  readonly kind: RecordingBlockKind;
  readonly textKey: string | null;
  /** Phosphor icon name registered by the consuming component. */
  readonly icon: string | null;
  readonly tone: StatusTone;
  /** Why it failed, as an i18n key (never the raw code). */
  readonly detailKey: string | null;
  /** The server said a retry is allowed. */
  readonly showRetry: boolean;
  readonly showReconnect: boolean;
}

const KNOWN_IMPORT_ERROR_CODES: readonly string[] = [
  'file_too_large',
  'transcode_failed',
  'transcode_timeout',
  'recording_scope_missing',
];

/** i18n key for an import `errorCode`, or `null` when there is none. Unknown codes read as a generic reason, never raw. */
export function recordingImportErrorKey(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return KNOWN_IMPORT_ERROR_CODES.includes(code)
    ? `live.recordingImport.error.${code}`
    : 'live.recordingImport.error.unknown';
}

const STATUS_TEXT_KEY = {
  Waiting: 'live.recordingImport.status.waiting',
  Transferring: 'live.recordingImport.status.transferring',
  Processing: 'live.recordingImport.status.processing',
  NoRecording: 'live.recordingImport.status.noRecording',
  Failed: 'live.recordingImport.status.failed',
  NeedsReconnect: 'live.recordingImport.status.needsReconnect',
} as const;

const NO_CONTROLS = { textKey: null, icon: null, tone: 'neutral', detailKey: null, showRetry: false, showReconnect: false } as const;

/**
 * What the recording block of an ENDED session shows. A session that already has a recording lesson is always `attached`
 * (a stale status can never contradict it); no import row, a personal account and `Skipped` all collapse to the plain
 * `manual` upload the screens had before this feature.
 */
export function recordingBlockView(
  info: RecordingImportInfo | null | undefined,
  hasRecording: boolean,
): RecordingBlockView {
  const status = info?.status ?? null;
  if (hasRecording || status === 'Attached') {
    return { ...NO_CONTROLS, kind: 'attached' };
  }
  const canRetry = info?.canRetry === true;
  switch (status) {
    case 'Waiting':
    case 'Transferring':
    case 'Processing':
      return { ...NO_CONTROLS, kind: 'importing', textKey: STATUS_TEXT_KEY[status], icon: 'phosphorCircleNotch', tone: 'info' };
    case 'NoRecording':
      return {
        ...NO_CONTROLS,
        kind: 'noRecording',
        textKey: STATUS_TEXT_KEY.NoRecording,
        icon: 'phosphorInfo',
        tone: 'warning',
        showRetry: canRetry,
      };
    case 'Failed':
      return {
        ...NO_CONTROLS,
        kind: 'failed',
        textKey: STATUS_TEXT_KEY.Failed,
        icon: 'phosphorWarningCircle',
        tone: 'danger',
        detailKey: recordingImportErrorKey(info?.errorCode),
        showRetry: canRetry,
      };
    case 'NeedsReconnect':
      return {
        ...NO_CONTROLS,
        kind: 'needsReconnect',
        textKey: STATUS_TEXT_KEY.NeedsReconnect,
        icon: 'phosphorPlugs',
        tone: 'warning',
        showRetry: canRetry,
        showReconnect: true,
      };
    default:
      // null, Skipped (nothing to import) -> the manual upload, exactly as before.
      return { ...NO_CONTROLS, kind: 'manual' };
  }
}

// --- Sessions list: a compact chip, text only (the whole card is a link, so no buttons) ---------------------------------

/**
 * Chip for the instructor sessions list, or `null` when there is nothing import-related to say (not ended, already has a
 * recording, manual path). Icons are ones `StatusChip` already registers.
 */
export function recordingListChip(
  displayState: LiveDisplayState,
  recordingEpisodeId: string | null,
  info: RecordingImportInfo | null | undefined,
): StatusView | null {
  if (displayState !== 'Ended') {
    return null;
  }
  const view = recordingBlockView(info, recordingEpisodeId !== null);
  switch (view.kind) {
    case 'importing':
      return { labelKey: 'live.recordingImport.chip.importing', icon: 'phosphorHourglass', tone: 'info' };
    case 'noRecording':
      return { labelKey: 'live.recordingImport.chip.noRecording', icon: 'phosphorCircleDashed', tone: 'warning' };
    case 'failed':
      return { labelKey: 'live.recordingImport.chip.failed', icon: 'phosphorWarningCircle', tone: 'danger' };
    case 'needsReconnect':
      return { labelKey: 'live.recordingImport.chip.needsReconnect', icon: 'phosphorPlugs', tone: 'warning' };
    default:
      return null;
  }
}

// --- Live settings page: the Recording card -------------------------------------------------------------------------------

export type RecordingCardView = 'manual' | 'manualPersonal' | 'needsConsent' | 'on';

/**
 * Which Recording card to show on the Google settings page; `null` = no card (the status has not loaded / predates this
 * feature). When the server flag is off the card only ever explains the manual path, whatever the mode says.
 */
export function recordingCardView(
  recording: RecordingCapability | null | undefined,
  accountKind: GoogleAccountKind | null | undefined,
): RecordingCardView | null {
  if (!recording) {
    return null;
  }
  if (!recording.autoImportAvailable) {
    return 'manual';
  }
  switch (recording.mode) {
    case 'Auto':
      return 'on';
    case 'AutoNeedsConsent':
      return 'needsConsent';
    default:
      return accountKind === 'Personal' ? 'manualPersonal' : 'manual';
  }
}
