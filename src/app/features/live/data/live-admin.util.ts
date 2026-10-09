import type { LiveAdminStatus } from './live-admin.models';
import type { IsoUtc } from './live.models';

// --- Verdict & warnings -----------------------------------------------------------------------------------------------

/** Warning codes the page has plain-language copy for. An unknown future code still renders — with a generic message. */
const KNOWN_WARNING_CODES: readonly string[] = [
  'no_job_server',
  'email_unconfigured',
  'outbox_backlog',
  'public_base_url_not_https',
  'google_not_configured',
  'meetings_stuck_pending',
];

export interface WarningView {
  /** The server's code, kept so an unknown one can still be shown to the admin as a diagnostic. */
  readonly code: string;
  readonly known: boolean;
  /** What is wrong, in a few words. */
  readonly titleKey: string;
  /** What it breaks for users. */
  readonly impactKey: string;
  /** What the admin should do about it. */
  readonly actionKey: string;
}

/** Maps a server warning code to the i18n keys that explain it. Never throws on an unrecognised code. */
export function warningView(code: string): WarningView {
  if (KNOWN_WARNING_CODES.includes(code)) {
    const base = `admin.liveStatus.warnings.${code}`;
    return { code, known: true, titleKey: `${base}.title`, impactKey: `${base}.impact`, actionKey: `${base}.action` };
  }
  const base = 'admin.liveStatus.warnings.unknown';
  return { code, known: false, titleKey: `${base}.title`, impactKey: `${base}.impact`, actionKey: `${base}.action` };
}

export type LiveAdminVerdict = 'ready' | 'attention';

/** "Ready" only when the server reported no warnings at all — never inferred from the other fields on the client. */
export function adminVerdict(status: Pick<LiveAdminStatus, 'warnings'>): LiveAdminVerdict {
  return status.warnings.length === 0 ? 'ready' : 'attention';
}

// --- Relative times & durations ---------------------------------------------------------------------------------------

export interface TimeView {
  readonly key: string;
  readonly count: number;
}

const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86_400;
/** Differences below this read as "just now" / "in a moment" — the snapshot itself is a few seconds old. */
const NOW_WINDOW_S = 5;

function parseMs(iso: IsoUtc | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * How far `iso` is from the server's `nowIso`, as an i18n key + count (`admin.liveStatus.time.*`). Measured against the
 * server's clock, not the admin's, so a wrong laptop clock cannot make a healthy job look overdue. `null` for a missing
 * or unparseable instant.
 */
export function relativeTime(iso: IsoUtc | null | undefined, nowIso: IsoUtc): TimeView | null {
  const target = parseMs(iso);
  const now = parseMs(nowIso);
  if (target === null || now === null) {
    return null;
  }
  const deltaS = Math.round((target - now) / 1000);
  const past = deltaS <= 0;
  const abs = Math.abs(deltaS);
  const direction = past ? 'Ago' : 'In';

  if (abs < NOW_WINDOW_S) {
    return { key: past ? 'admin.liveStatus.time.justNow' : 'admin.liveStatus.time.soon', count: 0 };
  }
  if (abs < MINUTE_S) {
    return { key: `admin.liveStatus.time.seconds${direction}`, count: abs };
  }
  if (abs < HOUR_S) {
    return { key: `admin.liveStatus.time.minutes${direction}`, count: Math.floor(abs / MINUTE_S) };
  }
  if (abs < DAY_S) {
    return { key: `admin.liveStatus.time.hours${direction}`, count: Math.floor(abs / HOUR_S) };
  }
  return { key: `admin.liveStatus.time.days${direction}`, count: Math.floor(abs / DAY_S) };
}

/** A length of time (the age of the oldest unsent e-mail) as an i18n key + count (`admin.liveStatus.duration.*`). */
export function durationView(seconds: number | null | undefined): TimeView | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  if (seconds < MINUTE_S) {
    return { key: 'admin.liveStatus.duration.seconds', count: Math.floor(seconds) };
  }
  if (seconds < HOUR_S) {
    return { key: 'admin.liveStatus.duration.minutes', count: Math.floor(seconds / MINUTE_S) };
  }
  if (seconds < DAY_S) {
    return { key: 'admin.liveStatus.duration.hours', count: Math.floor(seconds / HOUR_S) };
  }
  return { key: 'admin.liveStatus.duration.days', count: Math.floor(seconds / DAY_S) };
}

// --- Job state ---------------------------------------------------------------------------------------------------------

export type JobStateTone = 'success' | 'danger' | 'neutral';

/** Colour is never the only signal — the template pairs the tone with an icon and the state's own name. */
export function jobStateTone(state: string | null | undefined): JobStateTone {
  switch (state) {
    case 'Succeeded':
      return 'success';
    case 'Failed':
      return 'danger';
    default:
      return 'neutral';
  }
}
