import type { RecordingCapability, RecordingImportInfo, RecordingImportStatus } from './live-instructor.models';
import {
  hasInFlightRecordingImport,
  isRecordingImportInFlight,
  recordingBlockView,
  recordingCardView,
  recordingImportErrorKey,
  recordingListChip,
} from './live-recording-import.util';

const info = (overrides: Partial<RecordingImportInfo> = {}): RecordingImportInfo => ({
  mode: 'Auto',
  status: null,
  errorCode: null,
  nextAttemptAtUtc: null,
  canRetry: false,
  ...overrides,
});

describe('isRecordingImportInFlight', () => {
  it.each(['Waiting', 'Transferring', 'Processing'] as const)('%s is in flight', (status) => {
    expect(isRecordingImportInFlight(status)).toBe(true);
  });

  it.each(['Attached', 'NoRecording', 'Failed', 'NeedsReconnect', 'Skipped', null, undefined] as const)(
    '%s is not in flight',
    (status) => {
      expect(isRecordingImportInFlight(status)).toBe(false);
    },
  );
});

describe('hasInFlightRecordingImport', () => {
  it('is true only for an ENDED session that is importing', () => {
    expect(hasInFlightRecordingImport([{ displayState: 'Ended', recordingImport: info({ status: 'Waiting' }) }])).toBe(true);
    expect(hasInFlightRecordingImport([{ displayState: 'Upcoming', recordingImport: info({ status: 'Waiting' }) }])).toBe(false);
    expect(hasInFlightRecordingImport([{ displayState: 'Cancelled', recordingImport: info({ status: 'Processing' }) }])).toBe(false);
  });

  it('is false for terminal states, a missing import and an empty list', () => {
    expect(hasInFlightRecordingImport([{ displayState: 'Ended', recordingImport: info({ status: 'Failed' }) }])).toBe(false);
    expect(hasInFlightRecordingImport([{ displayState: 'Ended', recordingImport: null }])).toBe(false);
    expect(hasInFlightRecordingImport([{ displayState: 'Ended' }])).toBe(false);
    expect(hasInFlightRecordingImport([])).toBe(false);
  });

  it('is true when any one of several sessions is importing', () => {
    expect(
      hasInFlightRecordingImport([
        { displayState: 'Ended', recordingImport: info({ status: 'Attached' }) },
        { displayState: 'Ended', recordingImport: info({ status: 'Transferring' }) },
      ]),
    ).toBe(true);
  });
});

describe('recordingImportErrorKey', () => {
  it('maps each documented code to its own text and never echoes an unknown one', () => {
    for (const code of ['file_too_large', 'transcode_failed', 'transcode_timeout', 'recording_scope_missing']) {
      expect(recordingImportErrorKey(code)).toBe(`live.recordingImport.error.${code}`);
    }
    expect(recordingImportErrorKey('drive_file_id_abc123')).toBe('live.recordingImport.error.unknown');
  });

  it('has no key when there is no code', () => {
    expect(recordingImportErrorKey(null)).toBeNull();
    expect(recordingImportErrorKey(undefined)).toBeNull();
    expect(recordingImportErrorKey('')).toBeNull();
  });
});

describe('recordingBlockView', () => {
  it.each([
    ['Waiting', 'live.recordingImport.status.waiting'],
    ['Transferring', 'live.recordingImport.status.transferring'],
    ['Processing', 'live.recordingImport.status.processing'],
  ] as const)('%s -> importing, with its own sentence, no retry, no reconnect', (status, textKey) => {
    const view = recordingBlockView(info({ status, canRetry: true }), false);
    expect(view.kind).toBe('importing');
    expect(view.textKey).toBe(textKey);
    expect(view.showRetry).toBe(false);
    expect(view.showReconnect).toBe(false);
  });

  it('NoRecording -> offers Retry only when the server says canRetry', () => {
    expect(recordingBlockView(info({ status: 'NoRecording', canRetry: true }), false)).toMatchObject({
      kind: 'noRecording',
      showRetry: true,
      showReconnect: false,
    });
    expect(recordingBlockView(info({ status: 'NoRecording', canRetry: false }), false).showRetry).toBe(false);
  });

  it('Failed -> Retry only when canRetry, plus the reason as an i18n key', () => {
    const view = recordingBlockView(info({ status: 'Failed', errorCode: 'file_too_large', canRetry: true }), false);
    expect(view).toMatchObject({ kind: 'failed', showRetry: true, detailKey: 'live.recordingImport.error.file_too_large' });
    expect(recordingBlockView(info({ status: 'Failed', canRetry: false }), false)).toMatchObject({
      showRetry: false,
      detailKey: null,
    });
  });

  it('NeedsReconnect -> always the reconnect link; Retry only when canRetry', () => {
    expect(recordingBlockView(info({ status: 'NeedsReconnect', canRetry: false }), false)).toMatchObject({
      kind: 'needsReconnect',
      showReconnect: true,
      showRetry: false,
    });
    expect(recordingBlockView(info({ status: 'NeedsReconnect', canRetry: true }), false).showRetry).toBe(true);
  });

  it('a session that already has a recording is always "attached", whatever a stale status says', () => {
    for (const status of ['Waiting', 'NoRecording', 'Failed', 'NeedsReconnect', 'Attached', 'Skipped', null] as const) {
      const view = recordingBlockView(info({ status, canRetry: true }), true);
      expect(view.kind).toBe('attached');
      expect(view.showRetry).toBe(false);
      expect(view.textKey).toBeNull();
    }
  });

  it('Attached without a recording lesson yet (stale schedule) still reads as attached', () => {
    expect(recordingBlockView(info({ status: 'Attached' }), false).kind).toBe('attached');
  });

  it('no import row, Skipped, a manual-path instructor and a missing object all collapse to the plain manual upload', () => {
    for (const value of [null, undefined, info({ mode: 'Manual', status: null }), info({ status: 'Skipped' })]) {
      const view = recordingBlockView(value, false);
      expect(view).toMatchObject({ kind: 'manual', textKey: null, showRetry: false, showReconnect: false });
    }
  });

  it('never offers retry for a state the server did not mark retryable (canRetry is the only source)', () => {
    const all: RecordingImportStatus[] = ['Waiting', 'Transferring', 'Processing', 'Attached', 'NoRecording', 'Failed', 'NeedsReconnect', 'Skipped'];
    for (const status of all) {
      expect(recordingBlockView(info({ status, canRetry: false }), false).showRetry).toBe(false);
    }
  });
});

describe('recordingListChip', () => {
  it.each([
    ['Waiting', 'live.recordingImport.chip.importing'],
    ['Transferring', 'live.recordingImport.chip.importing'],
    ['Processing', 'live.recordingImport.chip.importing'],
    ['NoRecording', 'live.recordingImport.chip.noRecording'],
    ['Failed', 'live.recordingImport.chip.failed'],
    ['NeedsReconnect', 'live.recordingImport.chip.needsReconnect'],
  ] as const)('an ended session with %s -> %s', (status, labelKey) => {
    expect(recordingListChip('Ended', null, info({ status }))?.labelKey).toBe(labelKey);
  });

  it('is null when there is nothing import-related to say', () => {
    expect(recordingListChip('Ended', null, info({ status: null }))).toBeNull();
    expect(recordingListChip('Ended', null, info({ status: 'Skipped' }))).toBeNull();
    expect(recordingListChip('Ended', null, info({ status: 'Attached' }))).toBeNull();
    expect(recordingListChip('Ended', 'episode-1', info({ status: 'Failed' }))).toBeNull();
    expect(recordingListChip('Upcoming', null, info({ status: 'Waiting' }))).toBeNull();
    expect(recordingListChip('Ended', null, null)).toBeNull();
  });
});

describe('recordingCardView', () => {
  const capability = (overrides: Partial<RecordingCapability> = {}): RecordingCapability => ({
    mode: 'Manual',
    autoImportAvailable: true,
    scopesGranted: false,
    ...overrides,
  });

  it('shows no card until the status carries the capability', () => {
    expect(recordingCardView(null, 'Workspace')).toBeNull();
    expect(recordingCardView(undefined, 'Workspace')).toBeNull();
  });

  it('server flag off -> only the manual text, whatever the mode says', () => {
    for (const mode of ['Manual', 'AutoNeedsConsent', 'Auto'] as const) {
      expect(recordingCardView(capability({ mode, autoImportAvailable: false }), 'Workspace')).toBe('manual');
    }
  });

  it('flag on: Auto -> on, AutoNeedsConsent -> consent card', () => {
    expect(recordingCardView(capability({ mode: 'Auto', scopesGranted: true }), 'Workspace')).toBe('on');
    expect(recordingCardView(capability({ mode: 'AutoNeedsConsent' }), 'Workspace')).toBe('needsConsent');
  });

  it('flag on, Manual: a personal account is told why; anything else just gets the manual text', () => {
    expect(recordingCardView(capability(), 'Personal')).toBe('manualPersonal');
    expect(recordingCardView(capability(), 'Workspace')).toBe('manual');
    expect(recordingCardView(capability(), 'Unknown')).toBe('manual');
    expect(recordingCardView(capability(), null)).toBe('manual');
  });
});
