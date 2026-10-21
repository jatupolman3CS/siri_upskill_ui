import type { Routes } from '@angular/router';

import { TUTOR_BOOKING_ROUTE, buildBookingQueryParams, isRouteDeclared } from './tutor-booking-link';

const component = class {};

describe('isRouteDeclared', () => {
  it('finds a nested route by its full literal path', () => {
    const routes: Routes = [
      { path: '', component, children: [{ path: 'tutors', component }, { path: 'tutors/:slug', component }, { path: 'tutors/:slug/book', component }] },
    ];
    expect(isRouteDeclared(routes, TUTOR_BOOKING_ROUTE)).toBe(true);
  });

  it('joins parent and child segments', () => {
    const routes: Routes = [{ path: 'tutors', children: [{ path: ':slug', children: [{ path: 'book', component }] }] }];
    expect(isRouteDeclared(routes, 'tutors/:slug/book')).toBe(true);
  });

  it('is false while only the search and profile routes exist', () => {
    const routes: Routes = [{ path: '', component, children: [{ path: 'tutors', component }, { path: 'tutors/:slug', component }] }];
    expect(isRouteDeclared(routes, TUTOR_BOOKING_ROUTE)).toBe(false);
  });

  it('does not count a redirect as a declared page', () => {
    expect(isRouteDeclared([{ path: 'tutors/:slug/book', redirectTo: '' }], TUTOR_BOOKING_ROUTE)).toBe(false);
  });

  it('does not match a different parameter name or a longer path', () => {
    expect(isRouteDeclared([{ path: 'tutors/:id/book', component }], TUTOR_BOOKING_ROUTE)).toBe(false);
    expect(isRouteDeclared([{ path: 'tutors/:slug/book/confirm', component }], TUTOR_BOOKING_ROUTE)).toBe(false);
  });
});

describe('buildBookingQueryParams', () => {
  const base = { offeringId: 'off-1', startsAtUtc: '2026-10-14T02:00:00Z', durationMinutes: 90, format: 'OneOnOne' as const, trial: false };

  it('hands the booking page a plain pre-selection as strings', () => {
    expect(buildBookingQueryParams(base)).toEqual({
      offeringId: 'off-1',
      startsAtUtc: '2026-10-14T02:00:00Z',
      durationMinutes: '90',
      format: 'OneOnOne',
    });
  });

  it('adds trial=true only for a trial lesson', () => {
    expect(buildBookingQueryParams({ ...base, trial: true })['trial']).toBe('true');
    expect('trial' in buildBookingQueryParams(base)).toBe(false);
  });

  it('never carries a price, a total or a learner (the server decides all of those)', () => {
    expect(Object.keys(buildBookingQueryParams({ ...base, format: 'Group' })).sort()).toEqual(['durationMinutes', 'format', 'offeringId', 'startsAtUtc']);
  });
});
