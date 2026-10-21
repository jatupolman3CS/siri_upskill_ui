import type { StatusView } from '../../live/data/live-instructor.util';
import type { LiveRoomNeedsAction, RoomStatusDto, SessionStatus, TutorAttendanceResponse, TutorClassRoom } from './tutoring-classes.models';
import { sessionStatusLabelKey } from './tutoring-tutor-labels';

/**
 * How a class room is shown: an i18n label, an icon and a tone. `needsAction` is the discriminator - the server derives it, the
 * UI never re-derives it from `state` (same rule as the course live-session room card). Icons are registered by `StatusChip`.
 */
export function roomStatusView(room: Pick<RoomStatusDto, 'state' | 'needsAction' | 'isUsable'>): StatusView {
  switch (room.needsAction) {
    case 'Waiting':
      return { labelKey: 'tutoring.tutor.classes.room.status.waiting', icon: 'phosphorHourglass', tone: 'info' };
    case 'PasteLink':
      return { labelKey: 'tutoring.tutor.classes.room.status.pasteLink', icon: 'phosphorLinkSimple', tone: 'warning' };
    case 'ReconnectGoogle':
      return { labelKey: 'tutoring.tutor.classes.room.status.reconnectGoogle', icon: 'phosphorPlugs', tone: 'warning' };
    case 'Retry':
      return { labelKey: 'tutoring.tutor.classes.room.status.retry', icon: 'phosphorWarningCircle', tone: 'danger' };
    default:
      if (room.state === 'Cancelled') {
        return { labelKey: 'tutoring.tutor.classes.room.status.cancelled', icon: 'phosphorProhibit', tone: 'neutral' };
      }
      return room.isUsable
        ? { labelKey: 'tutoring.tutor.classes.room.status.ready', icon: 'phosphorCheckCircle', tone: 'success' }
        : { labelKey: 'tutoring.tutor.classes.room.status.unavailable', icon: 'phosphorCircleDashed', tone: 'neutral' };
  }
}

/** The room of a listed class (only its state and what is needed - no usability flag): `Ready` is the one state that counts as usable. */
export function listedRoomView(room: TutorClassRoom): StatusView {
  return roomStatusView({ state: room.state, needsAction: room.needsAction, isUsable: room.state === 'Ready' });
}

const KNOWN_ROOM_ERRORS: readonly string[] = ['conference_pending', 'google_account_unavailable', 'invalid_grant'];

/** i18n key for the room's `errorCode`; `null` when there is none. Raw codes are never displayed. */
export function roomErrorKey(code: string | null): string | null {
  if (!code) {
    return null;
  }
  return KNOWN_ROOM_ERRORS.includes(code) ? `tutoring.tutor.classes.room.error.${code}` : 'tutoring.tutor.classes.room.error.unknown';
}

/** The room actions the server wants from the tutor (everything but `None` / `Waiting`). */
export function roomNeedsTutor(action: LiveRoomNeedsAction): boolean {
  return action === 'PasteLink' || action === 'ReconnectGoogle' || action === 'Retry';
}

/** A class that can still change: its room is worth watching and the start / cancel actions make sense. */
export function isOpenSessionStatus(status: string): boolean {
  return status === 'Scheduled' || status === 'Held';
}

export function isKnownSessionStatus(status: string): status is SessionStatus {
  return ['Held', 'Scheduled', 'Cancelled', 'Completed', 'NoShowTutor', 'NoShowBoth'].includes(status);
}

/** True while the tutor has not yet been recorded as present (neither joined through the platform nor completed the class). */
export function tutorAttendanceMissing(attendance: TutorAttendanceResponse): boolean {
  return attendance.tutorJoinedAtUtc === null && attendance.tutorConfirmedAtUtc === null;
}

/** A class status as a chip (label + icon + tone - never colour alone). Icons are registered by `StatusChip`. */
export function sessionStatusView(status: SessionStatus): StatusView {
  const labelKey = sessionStatusLabelKey(status);
  switch (status) {
    case 'Scheduled':
      return { labelKey, icon: 'phosphorCalendarBlank', tone: 'info' };
    case 'Completed':
      return { labelKey, icon: 'phosphorCheckCircle', tone: 'success' };
    case 'Held':
      return { labelKey, icon: 'phosphorHourglass', tone: 'warning' };
    case 'NoShowTutor':
    case 'NoShowBoth':
      return { labelKey, icon: 'phosphorXCircle', tone: 'danger' };
    default:
      return { labelKey, icon: 'phosphorProhibit', tone: 'neutral' };
  }
}
