/** One entry of a studio (instructor/admin) navigation list — the single source both the desktop sidebar and the mobile drawer render. */
export interface StudioNavLink {
  readonly id: string;
  readonly route: string;
  /** Registered ng-icon name (the owning layout provides the icons). */
  readonly icon: string;
  /** i18n key of the visible label. */
  readonly labelKey: string;
  /** `true` when only the exact URL counts as active (a dashboard root that prefixes every other route). */
  readonly exact?: boolean;
}
