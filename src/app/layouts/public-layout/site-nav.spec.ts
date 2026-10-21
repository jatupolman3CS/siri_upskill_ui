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
    expect(SITE_NAV_LINKS.map((link) => link.id)).toEqual(['home', 'courses', 'live', 'tutors', 'blog', 'learning-paths']);
  });

  it('has a Tutors link to the public tutor search (no query string, highlighted on profile pages too)', () => {
    const tutors = SITE_NAV_LINKS.find((link) => link.id === 'tutors');
    expect(tutors?.path).toBe('/tutors');
    expect(tutors?.labelKey).toBe('nav.tutors');
    expect(tutors?.exact).toBe(false);
  });
});
