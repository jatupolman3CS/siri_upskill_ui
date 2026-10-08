import type { IsActiveMatchOptions } from '@angular/router';

/** Primary public navigation, shared by the desktop nav row and the mobile drawer. */
export interface SiteNavLink {
  readonly id: string;
  readonly labelKey: string;
  readonly path: string;
  /** Query string for `path` — a `routerLink` string does not parse `?…`, so it is passed separately. */
  readonly queryParams?: Readonly<Record<string, string>>;
  /** Highlight only on the exact URL (the home link would otherwise match every page). */
  readonly exact: boolean;
  /** Overrides `exact` when the link must also match on its query string (e.g. `/courses?format=Live`). */
  readonly activeOptions?: IsActiveMatchOptions;
}

/** Active only while the URL's query contains this link's own params (paths may be a subset). */
const MATCH_ON_QUERY: IsActiveMatchOptions = {
  paths: 'subset',
  queryParams: 'subset',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

export const SITE_NAV_LINKS: readonly SiteNavLink[] = [
  { id: 'home', labelKey: 'nav.home', path: '/', exact: true },
  { id: 'courses', labelKey: 'nav.courses', path: '/courses', exact: false },
  { id: 'live', labelKey: 'live.catalog.nav', path: '/courses', queryParams: { format: 'Live' }, exact: false, activeOptions: MATCH_ON_QUERY },
  { id: 'blog', labelKey: 'nav.blog', path: '/blog', exact: false },
  { id: 'learning-paths', labelKey: 'nav.learningPaths', path: '/learning-paths', exact: false },
];
