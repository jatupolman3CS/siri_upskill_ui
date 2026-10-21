import { convertToParamMap } from '@angular/router';

import {
  TUTOR_SEARCH_PAGE_SIZE,
  countTutorSearchFilters,
  hasTutorSearchFilters,
  parseTutorSearchQuery,
  toTutorSearchRequest,
  toTutorSearchRouteParams,
} from './tutor-search-query.util';

const parse = (params: Record<string, string>) => parseTutorSearchQuery(convertToParamMap(params));

describe('parseTutorSearchQuery', () => {
  it('parses every supported filter from the URL into a typed query', () => {
    expect(
      parse({
        q: '  physics  ',
        subject: 'physics',
        level: 'UpperSecondary',
        curriculum: 'EP',
        format: 'Group',
        priceMin: '200',
        priceMax: '600',
        gender: 'Female',
        day: '0',
        from: '09:00',
        to: '12:30',
        sort: 'priceAsc',
        page: '3',
      }),
    ).toEqual({
      q: 'physics',
      subject: 'physics',
      level: 'UpperSecondary',
      curriculum: 'EP',
      format: 'Group',
      priceMin: 200,
      priceMax: 600,
      gender: 'Female',
      day: 0,
      from: '09:00',
      to: '12:30',
      sort: 'priceAsc',
      page: 3,
    });
  });

  it('keeps Sunday (day=0) - it is a real weekday, not "unset"', () => {
    expect(parse({ day: '0', from: '09:00', to: '10:00' }).day).toBe(0);
  });

  it('drops every value that is invalid on its own, so a typo in the URL never becomes a 400', () => {
    expect(
      parse({
        level: 'Kindergarten',
        curriculum: 'x',
        format: 'Trio',
        gender: 'Robot',
        priceMin: '-5',
        priceMax: 'abc',
        day: '7',
        from: '9:00',
        to: '25:00',
        sort: 'cheapest',
        page: '0',
      }),
    ).toEqual({});
  });

  it('does not keep the default sort or page 1 in the query (they are the server defaults)', () => {
    expect(parse({ sort: 'relevance', page: '1' })).toEqual({});
  });

  it('caps the free text at 100 characters like the server', () => {
    expect(parse({ q: 'x'.repeat(250) }).q).toHaveLength(100);
  });

  it('leaves cross-field mistakes to the server (price range, partial time window)', () => {
    expect(parse({ priceMin: '500', priceMax: '100', day: '2' })).toEqual({ priceMin: 500, priceMax: 100, day: 2 });
  });
});

describe('toTutorSearchRouteParams', () => {
  it('omits empty values, defaults and request-only fields', () => {
    expect(
      toTutorSearchRouteParams({ q: '', subject: 'math', level: undefined, sort: 'relevance', page: 1, pageSize: 12, facets: true, day: 0 }),
    ).toEqual({ subject: 'math', day: 0 });
  });

  it('round-trips with parseTutorSearchQuery', () => {
    const query = parse({ q: 'math', subject: 'algebra', sort: 'rating', page: '2', priceMax: '500' });
    const params = toTutorSearchRouteParams(query);
    expect(parseTutorSearchQuery(convertToParamMap(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))))).toEqual(query);
  });
});

describe('filter helpers', () => {
  it('hasTutorSearchFilters ignores sort and page but counts the text search', () => {
    expect(hasTutorSearchFilters({ sort: 'rating', page: 4 })).toBe(false);
    expect(hasTutorSearchFilters({ q: 'math' })).toBe(true);
    expect(hasTutorSearchFilters({ day: 0 })).toBe(true);
    expect(hasTutorSearchFilters({ priceMax: 0 })).toBe(true);
  });

  it('countTutorSearchFilters counts sidebar filters only, with price and time window counted once each', () => {
    expect(countTutorSearchFilters({ q: 'math', sort: 'rating', page: 2 })).toBe(0);
    expect(
      countTutorSearchFilters({ subject: 'math', level: 'Adult', priceMin: 1, priceMax: 2, day: 1, from: '09:00', to: '10:00', gender: 'Male' }),
    ).toBe(5);
  });

  it('toTutorSearchRequest sets the page size and asks for facets on page 1 only', () => {
    expect(toTutorSearchRequest({ q: 'x' })).toEqual({ q: 'x', page: 1, pageSize: TUTOR_SEARCH_PAGE_SIZE, facets: true });
    expect(toTutorSearchRequest({ page: 3 })).toEqual({ page: 3, pageSize: TUTOR_SEARCH_PAGE_SIZE, facets: false });
  });
});
