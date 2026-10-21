import type { Route, Routes } from '@angular/router';

import type { Guid, IsoUtc, SessionFormat } from './tutoring-public.models';

/**
 * Route the booking flow (P13-22) must declare. Until that task registers it, the profile page keeps its "Book" action
 * disabled with an explanatory note - a button that navigates into the catch-all (which redirects home) would be a lie.
 */
export const TUTOR_BOOKING_ROUTE = 'tutors/:slug/book';

function joinPath(parent: string, segment: string | undefined): string {
  return [parent, segment ?? ''].filter((part) => part !== '').join('/');
}

function declares(routes: readonly Route[], target: string, parentPath: string): boolean {
  return routes.some((route) => {
    const fullPath = joinPath(parentPath, route.path);
    if (route.redirectTo === undefined && fullPath === target) {
      return true;
    }
    return route.children !== undefined && declares(route.children, target, fullPath);
  });
}

/**
 * Whether the router configuration declares `target` (a full path such as `tutors/:slug/book`, matched literally, across
 * nested `children`). Lazy `loadChildren` sub-trees are not entered; redirects do not count.
 */
export function isRouteDeclared(routes: Routes, target: string): boolean {
  return declares(routes, target, '');
}

export interface BookingSelection {
  readonly offeringId: Guid;
  readonly startsAtUtc: IsoUtc;
  readonly durationMinutes: number;
  readonly format: SessionFormat;
  readonly trial: boolean;
}

/**
 * Query params handed to the booking page. They are only a pre-selection: the booking flow re-validates the slot and
 * recomputes the price on the server, so nothing in here is trusted for money or entitlement.
 */
export function buildBookingQueryParams(selection: BookingSelection): Readonly<Record<string, string>> {
  return {
    offeringId: selection.offeringId,
    startsAtUtc: selection.startsAtUtc,
    durationMinutes: String(selection.durationMinutes),
    format: selection.format,
    ...(selection.trial ? { trial: 'true' } : {}),
  };
}
