import { SITE_NAV_LINKS } from './site-nav';

describe('SITE_NAV_LINKS', () => {
  it('has a Live link that opens the catalog filtered to live courses', () => {
    const live = SITE_NAV_LINKS.find((link) => link.id === 'live');
    expect(live).toBeDefined();
    expect(live?.path).toBe('/courses');
    expect(live?.queryParams).toEqual({ format: 'Live' });
    expect(live?.labelKey).toBe('live.catalog.nav');
  });

  it('matches the Live link on its query string (so it does not highlight on the plain catalog)', () => {
    const live = SITE_NAV_LINKS.find((link) => link.id === 'live');
    expect(live?.activeOptions?.queryParams).toBe('subset');
  });

  it('keeps every other link as before (no query string)', () => {
    expect(SITE_NAV_LINKS.filter((link) => link.id !== 'live').every((link) => link.queryParams === undefined)).toBe(true);
    expect(SITE_NAV_LINKS.map((link) => link.id)).toEqual(['home', 'courses', 'live', 'blog', 'learning-paths']);
  });
});
