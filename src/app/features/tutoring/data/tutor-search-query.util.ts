import type {
  DayOfWeekIndex,
  SessionFormat,
  TutorCurriculum,
  TutorGender,
  TutorLevel,
  TutorSearchQuery,
  TutorSort,
} from './tutoring-public.models';

/** Page size of `/tutors` (the server default is 12 and its ceiling 48). */
export const TUTOR_SEARCH_PAGE_SIZE = 12;

export const TUTOR_LEVELS: readonly TutorLevel[] = [
  'Primary',
  'LowerSecondary',
  'UpperSecondary',
  'University',
  'Competitive',
  'Adult',
];
export const TUTOR_CURRICULA: readonly TutorCurriculum[] = ['Thai', 'EP', 'International'];
export const TUTOR_GENDERS: readonly TutorGender[] = ['Male', 'Female', 'Other', 'Undisclosed'];
export const SESSION_FORMATS: readonly SessionFormat[] = ['OneOnOne', 'Group'];
export const TUTOR_SORTS: readonly TutorSort[] = ['relevance', 'rating', 'priceAsc', 'priceDesc', 'nextAvailable', 'newest'];
/** Rendering order of the weekday select (Monday first); the wire value is the `DayOfWeekIndex` (0 = Sunday). */
export const WEEKDAYS_MONDAY_FIRST: readonly DayOfWeekIndex[] = [1, 2, 3, 4, 5, 6, 0];

const MAX_QUERY_LENGTH = 100;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minimal slice of Angular's `ParamMap` - keeps the parser trivially unit-testable. */
export interface QueryParamReader {
  get(name: string): string | null;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

function nonNegativeNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function weekdayIndex(value: string | null): DayOfWeekIndex | undefined {
  if (value === null || !/^[0-6]$/.test(value)) {
    return undefined;
  }
  return Number(value) as DayOfWeekIndex;
}

function timeOfDay(value: string | null): string | undefined {
  return value !== null && TIME_PATTERN.test(value) ? value : undefined;
}

function pageNumber(value: string | null): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 1 ? parsed : undefined;
}

/**
 * The `/tutors` URL is the single source of truth for every filter (pressing Back must not reset them). This turns a query
 * string into a typed `TutorSearchQuery`, silently dropping any value that is not valid on its own (an unknown enum, a
 * negative price, a weekday outside 0-6, a malformed time) so a hand-edited link can never produce a 400 for a typo.
 * Cross-field rules (`priceMin > priceMax`, a partial `day`/`from`/`to` set) are deliberately NOT repaired here: the
 * filter form prevents them and the server remains the authority, answering `tutoring.search_invalid`.
 */
export function parseTutorSearchQuery(params: QueryParamReader): TutorSearchQuery {
  const sort = oneOf(TUTOR_SORTS, params.get('sort'));

  const query: Record<string, string | number> = {};
  const assign = (key: string, value: string | number | undefined): void => {
    if (value !== undefined && value !== '') {
      query[key] = value;
    }
  };
  assign('q', (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH));
  assign('subject', (params.get('subject') ?? '').trim());
  assign('level', oneOf(TUTOR_LEVELS, params.get('level')));
  assign('curriculum', oneOf(TUTOR_CURRICULA, params.get('curriculum')));
  assign('format', oneOf(SESSION_FORMATS, params.get('format')));
  assign('priceMin', nonNegativeNumber(params.get('priceMin')));
  assign('priceMax', nonNegativeNumber(params.get('priceMax')));
  assign('gender', oneOf(TUTOR_GENDERS, params.get('gender')));
  assign('day', weekdayIndex(params.get('day')));
  assign('from', timeOfDay(params.get('from')));
  assign('to', timeOfDay(params.get('to')));
  // `relevance` is the server default, so it is never written to (or kept in) the URL.
  assign('sort', sort !== undefined && sort !== 'relevance' ? sort : undefined);
  assign('page', pageNumber(params.get('page')));
  return query as TutorSearchQuery;
}

/** The query-string form of a `TutorSearchQuery` for `router.navigate`: defaults and empty values are omitted. */
export function toTutorSearchRouteParams(query: TutorSearchQuery): Readonly<Record<string, string | number>> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || key === 'pageSize' || key === 'facets') {
      continue;
    }
    if ((key === 'sort' && value === 'relevance') || (key === 'page' && value === 1)) {
      continue;
    }
    params[key] = value as string | number;
  }
  return params;
}

/** Whether any filter (everything except sort and page) narrows the result set - drives "clear all" and the empty state. */
export function hasTutorSearchFilters(query: TutorSearchQuery): boolean {
  return (
    !!query.q ||
    !!query.subject ||
    !!query.level ||
    !!query.curriculum ||
    !!query.format ||
    query.priceMin !== undefined ||
    query.priceMax !== undefined ||
    !!query.gender ||
    query.day !== undefined ||
    !!query.from ||
    !!query.to
  );
}

/** Number of narrowing filters set in the sidebar (everything except q, sort and page; the day + time window counts once). */
export function countTutorSearchFilters(query: TutorSearchQuery): number {
  const flags = [
    !!query.subject,
    !!query.level,
    !!query.curriculum,
    !!query.format,
    !!query.gender,
    query.priceMin !== undefined || query.priceMax !== undefined,
    query.day !== undefined || !!query.from || !!query.to,
  ];
  return flags.filter(Boolean).length;
}

/** What the API call needs on top of the URL: the page size, and facets only on page 1 (they do not depend on the page). */
export function toTutorSearchRequest(query: TutorSearchQuery): TutorSearchQuery {
  const page = query.page ?? 1;
  return { ...query, page, pageSize: TUTOR_SEARCH_PAGE_SIZE, facets: page === 1 };
}
