import { type FieldIssue, decimalPlaces, issue, parseNumber } from '../../ui/tutor-form.util';

/** The longest reason the tutor endpoints take (it is kept in the audit trail; a suspension reason is read by the tutor). */
export const REASON_MAX = 1000;
/** The commission override range the API accepts, in percent. */
export const COMMISSION_MIN = 0;
export const COMMISSION_MAX = 50;

export type ModerationMode = 'suspend' | 'reinstate' | 'commission';

/** A reason that is mandatory (suspend, commission) or optional (reinstate). */
export function reasonIssue(value: string, required: boolean): FieldIssue | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return required ? issue('tutoring.tutor.validation.required') : undefined;
  }
  return trimmed.length > REASON_MAX ? issue('tutoring.tutor.validation.tooLong', { max: REASON_MAX }) : undefined;
}

/** The override percentage as typed: 0-50 with at most two decimals. A convenience - the server re-checks the range. */
export function commissionIssue(raw: string): FieldIssue | undefined {
  const parsed = parseNumber(raw);
  if (parsed === null) {
    return issue('tutoring.tutor.validation.required');
  }
  if (Number.isNaN(parsed)) {
    return issue('tutoring.tutor.validation.notANumber');
  }
  if (decimalPlaces(parsed) > 2) {
    return issue('tutoring.tutor.validation.tooManyDecimals');
  }
  return parsed < COMMISSION_MIN || parsed > COMMISSION_MAX ? issue('tutoring.tutor.validation.outOfRange', { min: COMMISSION_MIN, max: COMMISSION_MAX }) : undefined;
}

/** What `commission` sends: `null` when the override is being cleared, else the typed number (already validated). */
export function commissionValue(useDefault: boolean, raw: string): number | null {
  return useDefault ? null : (parseNumber(raw) ?? null);
}
