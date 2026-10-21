/**
 * Tutor availability DTOs (P13-25, endpoints of P13-03 section 6.1) - mirror, field for field, the C# records of
 * `Siri.Modules.Tutoring/Application/Availability/AvailabilityModels.cs` and the "Frontend DTO appendix" of
 * `siri_upskill_backend/docs/contracts/P13-03-tutor-availability-and-slots.md`. If a C# record disagrees with a type here,
 * the C# record wins: report it, do not guess.
 *
 * Times of day are `"HH:mm"` and dates `"yyyy-MM-dd"`, both Asia/Bangkok wall-clock (UTC+7, no daylight saving); `dayOfWeek`
 * is `0` = Sunday ... `6` = Saturday. A rule whose `endLocal` is not after its `startLocal` runs into the next day. What is
 * bookable, and for how much, is the server's decision: the client edits these inputs and shows what comes back.
 */
import type { Guid } from './tutoring-tutor.models';

export type AvailabilityExceptionKind = 'Closed' | 'ExtraOpen';

export interface AvailabilitySettings {
  readonly minNoticeHours: number;
  readonly bufferMinutes: number;
  readonly maxAdvanceDays: number;
  /** Base64 concurrency token of the tutor profile (the settings live on it); a stale one answers `409 tutoring.concurrent_update`. */
  readonly rowVersion: string;
}

export interface AvailabilityRule {
  readonly dayOfWeek: number;
  readonly startLocal: string;
  readonly endLocal: string;
}

export interface TutorAvailability {
  readonly timezone: 'Asia/Bangkok';
  readonly settings: AvailabilitySettings;
  readonly rules: readonly AvailabilityRule[];
  /** The most rules the server accepts for one tutor. */
  readonly maxRules: number;
  /**
   * The class lengths (minutes) the platform accepts - `Tutoring:Slots:AllowedDurationsMinutes`, ascending, never empty and never `null`.
   * What the preview's length picker offers; the client holds no list of its own.
   */
  readonly allowedDurationMinutes: readonly number[];
  /** The rest lengths (minutes) after a class a tutor may choose - `Tutoring:Slots:AllowedBufferMinutes`, ascending. A buffer outside it answers `400`. */
  readonly allowedBufferMinutes: readonly number[];
}

export interface ReplaceRulesRequest {
  readonly rules: readonly AvailabilityRule[];
}

export interface SettingsRequest {
  readonly minNoticeHours: number;
  readonly bufferMinutes: number;
  readonly maxAdvanceDays: number;
  readonly rowVersion: string;
}

export interface CreateExceptionRequest {
  readonly dateLocal: string;
  readonly kind: AvailabilityExceptionKind;
  readonly startLocal: string | null;
  readonly endLocal: string | null;
  readonly note: string | null;
}

export interface AvailabilityException {
  readonly exceptionId: Guid;
  readonly dateLocal: string;
  readonly kind: AvailabilityExceptionKind;
  readonly startLocal: string | null;
  readonly endLocal: string | null;
  readonly note: string | null;
}

/** The violations the server names (`violation` extension of the 400 problem), one set per endpoint. */
export type RuleViolation = 'format' | 'order' | 'grid' | 'too_long' | 'overlap' | 'too_many';
export type ExceptionViolation = 'date' | 'date_window' | 'kind' | 'time' | 'order' | 'grid' | 'note';
