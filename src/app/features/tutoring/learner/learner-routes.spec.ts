import { RenderMode } from '@angular/ssr';
import type { Route } from '@angular/router';

import { routes } from '../../../app.routes';
import { serverRoutes } from '../../../app.routes.server';
import { authGuard } from '../../../core/guards/auth.guard';

/** Full path (`parent/child`) of every route, descending into `children`; lazy `loadChildren` trees are not entered. */
function flatten(list: readonly Route[], parent = ''): Route[] {
  return list.flatMap((route) => {
    const path = [parent, route.path ?? ''].filter((part) => part !== '').join('/');
    return [{ ...route, path }, ...(route.children ? flatten(route.children, path) : [])];
  });
}

const ALL_ROUTES = flatten(routes);
const find = (path: string): Route | undefined => ALL_ROUTES.find((route) => route.path === path);

describe('learner-side tutoring routes (P13-22)', () => {
  it.each(['tutors/:slug/book', 'tutoring/checkout/:bookingId', 'account/learner-profiles'])('declares %s behind the sign-in guard', (path) => {
    const route = find(path);

    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);
    expect(route?.loadComponent).toBeTypeOf('function');
  });

  it.each(['my-tutoring', 'my-tutoring/bookings/:bookingId', 'my-tutoring/disputes/:disputeId', 'tutoring/sessions/:sessionId/join'])(
    'declares %s behind the sign-in guard (P13-23)',
    (path) => {
      const route = find(path);

      expect(route).toBeDefined();
      expect(route?.canActivate).toContain(authGuard);
      expect(route?.loadComponent).toBeTypeOf('function');
    },
  );

  it.each(['tutors/:slug/packages/:packageId', 'tutoring/checkout/package/:purchaseId', 'my-tutoring/packages', 'my-tutoring/packages/:purchaseId'])(
    'declares %s behind the sign-in guard (P13-22b)',
    (path) => {
      const route = find(path);

      expect(route).toBeDefined();
      expect(route?.canActivate).toContain(authGuard);
      expect(route?.loadComponent).toBeTypeOf('function');
    },
  );

  it('tells the shared checkout page that the package route pays for a package, and the booking route nothing', () => {
    expect(find('tutoring/checkout/package/:purchaseId')?.data).toEqual({ checkoutKind: 'Package' });
    expect(find('tutoring/checkout/:bookingId')?.data).toBeUndefined();
  });

  it('gives the package purchase page its own exact client-only entry (in the same change as its route), and covers the rest with the existing patterns', () => {
    expect(serverRoutes.find((route) => route.path === 'tutors/:slug/packages/:packageId')?.renderMode).toBe(RenderMode.Client);
    // `my-tutoring/packages**` is under `my-tutoring/**` and `tutoring/checkout/package/**` under `tutoring/**`.
    expect(serverRoutes.find((route) => route.path === 'my-tutoring/**')?.renderMode).toBe(RenderMode.Client);
    expect(serverRoutes.find((route) => route.path === 'tutoring/**')?.renderMode).toBe(RenderMode.Client);
  });

  it('renders my-tutoring and everything under it on the client only, in the same change that declares the route (ng build fails otherwise)', () => {
    expect(serverRoutes.find((route) => route.path === 'my-tutoring')?.renderMode).toBe(RenderMode.Client);
    expect(serverRoutes.find((route) => route.path === 'my-tutoring/**')?.renderMode).toBe(RenderMode.Client);
  });

  it('keeps the public tutor profile open to everyone', () => {
    expect(find('tutors/:slug')?.canActivate).toBeUndefined();
  });

  it.each(['tutors/:slug/book', 'account/learner-profiles'])('renders %s on the client only - the in-memory token does not exist during SSR', (path) => {
    expect(serverRoutes.find((route) => route.path === path)?.renderMode).toBe(RenderMode.Client);
  });

  it('covers the checkout with the client-rendered tutoring/** pattern', () => {
    expect(serverRoutes.find((route) => route.path === 'tutoring/**')?.renderMode).toBe(RenderMode.Client);
  });

  it('lists every client-only entry before the catch-all, and only exact paths that a route declares (ng build fails otherwise)', () => {
    const catchAll = serverRoutes.findIndex((route) => route.path === '**');
    expect(catchAll).toBe(serverRoutes.length - 1);

    const declared = new Set(ALL_ROUTES.map((route) => route.path));
    const dangling = serverRoutes.map((route) => route.path).filter((path) => !path.includes('*') && !declared.has(path));
    expect(dangling).toEqual([]);
  });
});
