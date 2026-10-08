import { StudioNavLink } from '../studio-mobile-nav/studio-nav-link';

/**
 * Instructor Studio navigation — one list rendered by both the desktop sidebar and the mobile drawer
 * (`StudioMobileNav`), so an entry added here can never be reachable on one and missing on the other.
 */
export const INSTRUCTOR_NAV_LINKS: readonly StudioNavLink[] = [
  { id: 'dashboard', route: '/instructor', icon: 'phosphorHouse', labelKey: 'instructor.nav.dashboard', exact: true },
  { id: 'courses', route: '/instructor/courses', icon: 'phosphorBookOpen', labelKey: 'instructor.nav.courses' },
  { id: 'analytics', route: '/instructor/analytics', icon: 'phosphorChartBar', labelKey: 'instructor.nav.analytics' },
  { id: 'announcements', route: '/instructor/announcements', icon: 'phosphorMegaphone', labelKey: 'instructor.nav.announcements' },
  { id: 'earnings', route: '/instructor/earnings', icon: 'phosphorCurrencyDollar', labelKey: 'instructor.nav.earnings' },
  { id: 'sessions', route: '/instructor/sessions', icon: 'phosphorVideoCamera', labelKey: 'live.instructor.nav.sessions' },
  { id: 'live-settings', route: '/instructor/live-settings', icon: 'phosphorGoogleLogo', labelKey: 'live.instructor.nav.liveSettings' },
];

/** The header's mode-switch / create links, repeated in the drawer because the header hides them on small screens. */
export const INSTRUCTOR_SWITCH_LINKS: readonly StudioNavLink[] = [
  { id: 'to-learner', route: '/my-courses', icon: 'phosphorArrowLeft', labelKey: 'instructor.nav.toLearner' },
  { id: 'create-course', route: '/instructor/courses/new', icon: 'phosphorPlusCircle', labelKey: 'instructor.nav.createCourse' },
];

/** Admins only — shown ahead of {@link INSTRUCTOR_SWITCH_LINKS}. */
export const INSTRUCTOR_ADMIN_SWITCH_LINK: StudioNavLink = {
  id: 'to-admin',
  route: '/admin',
  icon: 'phosphorGraduationCap',
  labelKey: 'instructor.nav.toAdmin',
};
