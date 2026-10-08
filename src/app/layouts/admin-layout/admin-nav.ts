import { StudioNavLink } from '../studio-mobile-nav/studio-nav-link';

/**
 * Admin navigation — one list rendered by both the desktop sidebar and the mobile drawer
 * (`StudioMobileNav`), so an entry added here can never be reachable on one and missing on the other.
 */
export const ADMIN_NAV_LINKS: readonly StudioNavLink[] = [
  { id: 'dashboard', route: '/admin', icon: 'phosphorHouse', labelKey: 'admin.nav.dashboard', exact: true },
  { id: 'moderation', route: '/admin/courses', icon: 'phosphorGraduationCap', labelKey: 'admin.nav.moderation' },
  { id: 'users', route: '/admin/users', icon: 'phosphorUsers', labelKey: 'admin.nav.users' },
  { id: 'marketing', route: '/admin/marketing', icon: 'phosphorTag', labelKey: 'admin.nav.marketing' },
  { id: 'banners', route: '/admin/banners', icon: 'phosphorImage', labelKey: 'admin.nav.banners' },
  { id: 'menus', route: '/admin/menus', icon: 'phosphorList', labelKey: 'admin.nav.menus' },
  { id: 'posts', route: '/admin/posts', icon: 'phosphorArticle', labelKey: 'admin.nav.posts' },
  { id: 'payouts', route: '/admin/payouts', icon: 'phosphorCurrencyDollar', labelKey: 'admin.nav.payouts' },
  { id: 'payments', route: '/admin/payments', icon: 'phosphorCreditCard', labelKey: 'admin.nav.payments' },
  { id: 'contact', route: '/admin/contact-messages', icon: 'phosphorEnvelopeSimple', labelKey: 'admin.nav.contact' },
];

/** The header's mode-switch links, repeated in the drawer because the header hides them on small screens. */
export const ADMIN_SWITCH_LINKS: readonly StudioNavLink[] = [
  { id: 'to-instructor', route: '/instructor', icon: 'phosphorChalkboardTeacher', labelKey: 'admin.nav.toInstructor' },
  { id: 'to-learner', route: '/my-courses', icon: 'phosphorGraduationCap', labelKey: 'admin.nav.toLearner' },
  { id: 'to-home', route: '/', icon: 'phosphorHouse', labelKey: 'admin.nav.toHome' },
];
