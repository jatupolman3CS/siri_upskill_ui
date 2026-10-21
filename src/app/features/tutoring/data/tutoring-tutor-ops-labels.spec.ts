import { ApiError } from '../../../core/http/error.interceptor';
import { TUTORING_EN as en, TUTORING_TH as th } from '../testing/tutoring-i18n';
import { ruleViolationKey } from '../tutor/tutor-availability.util';
import { isKnownSessionStatus, isOpenSessionStatus, roomErrorKey, roomNeedsTutor, roomStatusView, sessionStatusView, tutorAttendanceMissing } from './tutor-class-view.util';
import { tutoringErrorKey, tutoringReasonKey } from './tutoring-errors';
import {
  LEDGER_KINDS,
  LEDGER_SOURCE_KINDS,
  LEDGER_STATES,
  MATERIAL_KINDS,
  PENALTY_KINDS,
  REFUND_DISPLAY_STATUSES,
  REFUND_SETTLEMENTS,
  SESSION_STATUSES,
  bookingStatusKeyOf,
  ledgerKindLabelKey,
  ledgerSourceLabelKey,
  ledgerStateLabelKey,
  ledgerStateTone,
  materialKindLabelKey,
  penaltyKindLabelKey,
  refundSettlementLabelKey,
  refundStatusLabelKey,
  sessionStatusLabelKey,
} from './tutoring-tutor-labels';
import type { RoomStatusDto, TutorAttendanceResponse } from './tutoring-classes.models';

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

function expectInBoth(key: string): void {
  expect(typeof lookup(th, key), `th: ${key}`).toBe('string');
  expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
}

const room = (overrides: Partial<RoomStatusDto> = {}): RoomStatusDto => ({
  state: 'Ready',
  needsAction: 'None',
  provider: 'GoogleMeet',
  hasMeetingLink: true,
  isUsable: true,
  lastSyncAtUtc: null,
  errorCode: null,
  ...overrides,
});

describe('classes, wallet and cancellation enum label keys', () => {
  // Built at runtime, so i18n-guard.spec cannot see them - this is their guard.
  const keys = [
    ...SESSION_STATUSES.map(sessionStatusLabelKey),
    ...LEDGER_STATES.map(ledgerStateLabelKey),
    ...LEDGER_KINDS.map(ledgerKindLabelKey),
    ...LEDGER_SOURCE_KINDS.map(ledgerSourceLabelKey),
    ...MATERIAL_KINDS.map(materialKindLabelKey),
    ...PENALTY_KINDS.map(penaltyKindLabelKey),
    ...REFUND_SETTLEMENTS.map(refundSettlementLabelKey),
    ...REFUND_DISPLAY_STATUSES.map(refundStatusLabelKey),
    bookingStatusKeyOf('SomethingNew'),
    'tutoring.tutor.classes.scope.upcoming',
    'tutoring.tutor.classes.scope.history',
    ...['closedAllDay', 'closedRange', 'extraOpen'].map((choice) => `tutoring.tutor.availability.exceptions.choice.${choice}`),
    ...['format', 'order', 'grid', 'too_long', 'overlap', 'too_many', 'weird'].map((violation) => ruleViolationKey(violation)),
    ...['conference_pending', 'google_account_unavailable', 'invalid_grant', 'other'].map((code) => roomErrorKey(code) ?? ''),
  ];

  it('covers every value of every enum', () => {
    expect(SESSION_STATUSES).toHaveLength(6);
    expect(LEDGER_STATES).toHaveLength(7);
    expect(REFUND_DISPLAY_STATUSES).toHaveLength(4);
  });

  it.each(keys)('%s resolves in Thai and English', (key) => {
    expectInBoth(key);
  });

  it('labels every known booking status and degrades an unknown one', () => {
    expect(bookingStatusKeyOf('Confirmed')).toBe('tutoring.enums.bookingStatus.Confirmed');
    expect(bookingStatusKeyOf('SomethingNew')).toBe('tutoring.enums.bookingStatus.unknown');
  });

  it('uses only token tone classes for ledger chips', () => {
    expect(LEDGER_STATES.map(ledgerStateTone).every((tone) => tone === '' || /^tone-[a-z]+$/.test(tone))).toBe(true);
    expect(ledgerStateTone('Available')).toBe('tone-green');
    expect(ledgerStateTone('Frozen')).toBe('tone-gold');
  });
});

describe('class status and room views', () => {
  it('gives every class status a label, an icon and a tone (never colour alone)', () => {
    for (const status of SESSION_STATUSES) {
      const view = sessionStatusView(status);
      expect(view.labelKey).toBe(sessionStatusLabelKey(status));
      expect(view.icon).toMatch(/^phosphor/);
    }
    expect(sessionStatusView('Completed').tone).toBe('success');
    expect(sessionStatusView('NoShowTutor').tone).toBe('danger');
  });

  it('knows which statuses are still open and which strings are statuses at all', () => {
    expect(isOpenSessionStatus('Scheduled')).toBe(true);
    expect(isOpenSessionStatus('Completed')).toBe(false);
    expect(isKnownSessionStatus('Held')).toBe(true);
    expect(isKnownSessionStatus('Nonsense')).toBe(false);
  });

  it('chooses the room view from the server needsAction only', () => {
    expect(roomStatusView(room({ needsAction: 'Waiting', isUsable: true })).tone).toBe('info');
    expect(roomStatusView(room({ needsAction: 'PasteLink', isUsable: false })).labelKey).toBe('tutoring.tutor.classes.room.status.pasteLink');
    expect(roomStatusView(room({ needsAction: 'ReconnectGoogle' })).icon).toBe('phosphorPlugs');
    expect(roomStatusView(room({ needsAction: 'Retry' })).tone).toBe('danger');
    expect(roomStatusView(room({ state: 'Cancelled', isUsable: false })).labelKey).toBe('tutoring.tutor.classes.room.status.cancelled');
    expect(roomStatusView(room()).tone).toBe('success');
    expect(roomStatusView(room({ isUsable: false, state: 'Pending' })).labelKey).toBe('tutoring.tutor.classes.room.status.unavailable');
  });

  it('asks the tutor to act only for PasteLink, ReconnectGoogle and Retry, and has no key for an absent error', () => {
    expect(['None', 'Waiting', 'PasteLink', 'ReconnectGoogle', 'Retry'].filter((a) => roomNeedsTutor(a as 'None'))).toEqual(['PasteLink', 'ReconnectGoogle', 'Retry']);
    expect(roomErrorKey(null)).toBeNull();
  });

  it('reports a tutor as absent until the platform recorded a join or a completion', () => {
    const base: TutorAttendanceResponse = {
      sessionId: 's',
      startsAtUtc: 'a',
      endsAtUtc: 'b',
      status: 'Scheduled',
      tutorJoinedAtUtc: null,
      tutorConfirmedAtUtc: null,
      finalizedAtUtc: null,
      learners: [],
    };
    expect(tutorAttendanceMissing(base)).toBe(true);
    expect(tutorAttendanceMissing({ ...base, tutorJoinedAtUtc: '2026-10-20T02:00:00Z' })).toBe(false);
    expect(tutorAttendanceMissing({ ...base, tutorConfirmedAtUtc: '2026-10-20T03:00:00Z' })).toBe(false);
  });
});

describe('P13-25 error reasons', () => {
  const REASONS: readonly (readonly [string, string])[] = [
    ['tutoring.availability_rule_invalid', 'tutoring.errors.availabilityRuleInvalid'],
    ['tutoring.availability_exception_invalid', 'tutoring.errors.availabilityExceptionInvalid'],
    ['tutoring.availability_exception_conflict', 'tutoring.errors.availabilityExceptionConflict'],
    ['tutoring.availability_exception_limit', 'tutoring.errors.availabilityExceptionLimit'],
    ['tutoring.session_cancelled', 'tutoring.errors.sessionCancelled'],
    ['tutoring.session_closed', 'tutoring.errors.sessionClosed'],
    ['tutoring.session_ended', 'tutoring.errors.sessionEnded'],
    ['tutoring.window_not_open', 'tutoring.errors.windowNotOpen'],
    ['tutoring.room_not_ready', 'tutoring.errors.roomNotReady'],
    ['tutoring.complete_too_early', 'tutoring.errors.completeTooEarly'],
    ['tutoring.complete_no_learner_present', 'tutoring.errors.completeNoLearnerPresent'],
    ['tutoring.summary_locked', 'tutoring.errors.summaryLocked'],
    ['tutoring.material_limit_reached', 'tutoring.errors.materialLimitReached'],
    ['tutoring.material_link_not_allowed', 'tutoring.errors.materialLinkNotAllowed'],
    ['tutoring.materials_files_disabled', 'tutoring.errors.materialsFilesDisabled'],
    ['tutoring.virus_scanner_not_configured', 'tutoring.errors.virusScannerNotConfigured'],
    ['tutoring.storage_not_configured', 'tutoring.errors.storageNotConfigured'],
    ['live.meeting_link_invalid', 'tutoring.errors.meetingLinkInvalid'],
    ['live.meeting_link_host_not_allowed', 'tutoring.errors.meetingLinkHostNotAllowed'],
    ['live.room_not_editable', 'tutoring.errors.roomNotEditable'],
    ['live.meeting_not_resyncable', 'tutoring.errors.meetingNotResyncable'],
    ['tutoring.class_not_found', 'tutoring.errors.classNotFound'],
    ['tutoring.class_not_cancellable', 'tutoring.errors.classNotCancellable'],
    ['tutoring.cancel_after_end', 'tutoring.errors.cancelAfterEnd'],
    ['tutoring.package_not_found', 'tutoring.errors.packageNotFound'],
    ['tutoring.package_duplicate_shape', 'tutoring.errors.packageDuplicateShape'],
    ['tutoring.package_limit', 'tutoring.errors.packageLimit'],
    ['tutoring.package_price_below_minimum', 'tutoring.errors.packagePriceBelowMinimum'],
  ];

  it.each(REASONS)('maps %s to %s, which exists in both dictionaries', (reason, key) => {
    expect(tutoringErrorKey(new ApiError(409, 'x', 'conflict', { status: 409, reason }))).toBe(key);
    expectInBoth(key);
  });

  it('turns a bare refusal code from a quote into the same key, with or without the prefix', () => {
    expect(tutoringReasonKey('class_not_cancellable')).toBe('tutoring.errors.classNotCancellable');
    expect(tutoringReasonKey('tutoring.cancel_after_end')).toBe('tutoring.errors.cancelAfterEnd');
    expect(tutoringReasonKey('something_new')).toBe('tutoring.errors.generic');
    expect(tutoringReasonKey(null)).toBe('tutoring.errors.generic');
  });
});
