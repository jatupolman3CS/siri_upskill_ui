import {
  phosphorChalkboardTeacher,
  phosphorDevices,
  phosphorGearSix,
  phosphorGraduationCap,
  phosphorHeart,
  phosphorReceipt,
  phosphorShieldCheck,
  phosphorVideoCamera,
} from '@ng-icons/phosphor-icons/regular';

/** One link in the signed-in account menu (desktop dropdown and mobile drawer share this list). */
export interface AccountMenuItem {
  readonly id: string;
  readonly labelKey: string;
  readonly route: string;
  /** Phosphor icon name — the component rendering it must register it via `provideIcons(ACCOUNT_MENU_ICONS)`. */
  readonly icon: string;
}

export interface AccountMenuFlags {
  /** `AuthService.canUseInstructorStudio()` — the studio when true, the application wizard otherwise. */
  readonly canUseInstructorStudio: boolean;
  /** `AuthService.isAdmin()` — only then is the admin panel offered. */
  readonly isAdmin: boolean;
}

/** The Phosphor icons `buildAccountMenuItems` refers to by name — one object so every consumer
 *  (dropdown, drawer) registers exactly the same set. */
export const ACCOUNT_MENU_ICONS = {
  phosphorGraduationCap,
  phosphorVideoCamera,
  phosphorReceipt,
  phosphorHeart,
  phosphorDevices,
  phosphorShieldCheck,
  phosphorChalkboardTeacher,
  phosphorGearSix,
};

/**
 * Links shown to a signed-in user, in display order. "My live sessions" points at My courses for now: a
 * dedicated live-schedule page does not exist yet, and a menu entry must never lead to a route that
 * does not (re-point it when that page ships). Hiding the admin entry is a convenience only — the
 * `/admin` route itself is guarded by `roleGuard` and every admin API is authorised server-side.
 */
export function buildAccountMenuItems(flags: AccountMenuFlags): readonly AccountMenuItem[] {
  const items: AccountMenuItem[] = [
    { id: 'my-courses', labelKey: 'nav.myCourses', route: '/my-courses', icon: 'phosphorGraduationCap' },
    { id: 'my-live-sessions', labelKey: 'nav.myLiveSessions', route: '/my-courses', icon: 'phosphorVideoCamera' },
    { id: 'orders', labelKey: 'nav.orders', route: '/account/orders', icon: 'phosphorReceipt' },
    { id: 'wishlist', labelKey: 'nav.wishlist', route: '/wishlist', icon: 'phosphorHeart' },
    { id: 'devices', labelKey: 'nav.devices', route: '/account/devices', icon: 'phosphorDevices' },
    { id: 'privacy', labelKey: 'nav.privacyData', route: '/account/privacy', icon: 'phosphorShieldCheck' },
    flags.canUseInstructorStudio
      ? { id: 'instructor', labelKey: 'nav.instructor', route: '/instructor', icon: 'phosphorChalkboardTeacher' }
      : {
          id: 'become-instructor',
          labelKey: 'nav.becomeInstructor',
          route: '/become-instructor',
          icon: 'phosphorChalkboardTeacher',
        },
  ];
  if (flags.isAdmin) {
    items.push({ id: 'admin', labelKey: 'nav.adminPanel', route: '/admin', icon: 'phosphorGearSix' });
  }
  return items;
}
