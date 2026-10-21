import { signal } from '@angular/core';

import { ApiError } from '../../../core/http/error.interceptor';
import type { TranslationService } from '../../../core/i18n/translation.service';

/**
 * Client-side form checks of the Tutor Portal. They are a convenience (the person learns about a mistake before the round
 * trip) and never a gate: the server re-validates everything and its answer always wins. Rules that depend on server
 * configuration (price bounds, minimum bio length, ...) are therefore NOT mirrored here - the server's readiness blockers
 * and validation answer cover them - only the structural rules of the contract are.
 */

/** One problem with one field: an i18n key plus its interpolation params. */
export interface FieldIssue {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export type FieldIssues<F extends string> = Partial<Record<F, FieldIssue>>;

export const issue = (key: string, params?: Readonly<Record<string, string | number>>): FieldIssue => ({ key, params });

/** `<` followed by a letter, `/` or `!` - what the server refuses in plain-text fields (P13-01 section 5.5). */
const MARKUP = /<\s*[a-zA-Z/!]/;
/** ASCII control characters other than tab / line feed / carriage return. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/** Trims; `null` when nothing is left (the API wants `null`, not an empty string, for an absent optional text). */
export function trimToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parses a number field. `null` = the field is empty; `Number.NaN` = it holds something that is not a number.
 * A comma is accepted as a decimal separator so a Thai/European keyboard layout does not silently lose the fraction.
 */
export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text.length === 0) {
    return null;
  }
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
}

export function decimalPlaces(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Checks a required free-text field: length in `[min, max]`, no markup, no control characters. */
export function textIssue(value: string, min: number, max: number, opts: { readonly allowMarkup?: boolean } = {}): FieldIssue | undefined {
  const length = value.trim().length;
  if (length === 0) {
    return issue('tutoring.tutor.validation.required');
  }
  if (length < min) {
    return issue('tutoring.tutor.validation.tooShort', { min });
  }
  if (value.length > max) {
    return issue('tutoring.tutor.validation.tooLong', { max });
  }
  if (hasControlCharacter(value) || (!opts.allowMarkup && MARKUP.test(value))) {
    return issue('tutoring.tutor.validation.noMarkup');
  }
  return undefined;
}

/** Checks an optional free-text field: empty is fine, otherwise at most `max` characters and no markup. */
export function optionalTextIssue(value: string, max: number): FieldIssue | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }
  if (value.length > max) {
    return issue('tutoring.tutor.validation.tooLong', { max });
  }
  return hasControlCharacter(value) || MARKUP.test(value) ? issue('tutoring.tutor.validation.noMarkup') : undefined;
}

/** Checks a whole-number field with inclusive bounds (`required` unless `optional`). */
export function integerIssue(raw: string, min: number, max: number, optional = false): FieldIssue | undefined {
  const parsed = parseNumber(raw);
  if (parsed === null) {
    return optional ? undefined : issue('tutoring.tutor.validation.required');
  }
  if (!Number.isInteger(parsed)) {
    return issue('tutoring.tutor.validation.wholeNumber');
  }
  return parsed < min || parsed > max ? issue('tutoring.tutor.validation.outOfRange', { min, max }) : undefined;
}

/** Checks a baht amount: a number with at most two decimals, at least `min`. */
export function amountIssue(raw: string, min: number, optional = false): FieldIssue | undefined {
  const parsed = parseNumber(raw);
  if (parsed === null) {
    return optional ? undefined : issue('tutoring.tutor.validation.required');
  }
  if (Number.isNaN(parsed)) {
    return issue('tutoring.tutor.validation.notANumber');
  }
  if (decimalPlaces(parsed) > 2) {
    return issue('tutoring.tutor.validation.tooManyDecimals');
  }
  return parsed < min ? issue('tutoring.tutor.validation.minAmount', { min }) : undefined;
}

/** The calendar year in Thailand (UTC+7, no daylight saving) of `now` - the year a tutor's "this year" means. */
export function bangkokYear(now: Date): number {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCFullYear();
}

/**
 * "Show the error only once the person has had the chance to fill the field" bookkeeping (frontend.md: errors appear on
 * touched/dirty fields, plus everything after a submit attempt). Plain signals instead of reading `control.touched`, which
 * is not reactive and would leave a zoneless, OnPush page showing stale errors.
 */
export class FieldFeedback<F extends string> {
  private readonly touched = signal<ReadonlySet<F>>(new Set());
  private readonly attempted = signal(false);

  touch(field: F): void {
    if (!this.touched().has(field)) {
      this.touched.update((fields) => new Set(fields).add(field));
    }
  }

  /** Call when the person presses submit: from then on every field may show its error. */
  attempt(): void {
    this.attempted.set(true);
  }

  reset(): void {
    this.touched.set(new Set());
    this.attempted.set(false);
  }

  /** The translated message to show under `field`, or `undefined`. */
  messageFor(field: F, issues: FieldIssues<F>, i18n: TranslationService, serverRejected?: ReadonlySet<F>): string | undefined {
    if (!this.touched().has(field) && !this.attempted()) {
      return undefined;
    }
    const found = issues[field];
    if (found) {
      return i18n.t(found.key, found.params);
    }
    return serverRejected?.has(field) ? i18n.t('tutoring.tutor.validation.serverRejected') : undefined;
  }
}

/**
 * Names, as form fields, the properties a `400 validation` response rejected. The response keys are the C# property names
 * (PascalCase, e.g. `HourlyRateOneOnOne`), so the caller supplies the mapping to its own field names.
 */
export function serverRejectedFields<F extends string>(error: unknown, propertyToField: Readonly<Record<string, F>>): ReadonlySet<F> {
  const rejected = new Set<F>();
  const details = error instanceof ApiError ? error.details : undefined;
  const errors = typeof details === 'object' && details !== null ? (details as { errors?: unknown }).errors : undefined;
  if (typeof errors === 'object' && errors !== null) {
    for (const property of Object.keys(errors)) {
      const field = propertyToField[property];
      if (field !== undefined) {
        rejected.add(field);
      }
    }
  }
  return rejected;
}

/**
 * Moves keyboard focus to the first control marked invalid inside `root` (a control exposes `aria-invalid="true"` once it
 * shows an error), falling back to `fallback` (typically an error summary). Call after the DOM has re-rendered.
 */
export function focusFirstInvalid(root: HTMLElement | null | undefined, fallback?: HTMLElement | null): void {
  const target = root?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? fallback;
  target?.focus();
}
