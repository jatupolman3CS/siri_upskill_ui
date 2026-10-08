import { phosphorCode, phosphorCoins, phosphorFolder, phosphorMegaphone } from '@ng-icons/phosphor-icons/regular';

/**
 * Maps `CategoryTreeNode.iconKey` (a free-form string — the backend's `CreateCategoryValidator` only
 * caps its length, no allow-list) to a Phosphor icon name registered via `@ng-icons/phosphor-icons`.
 * Every value currently seeded (`CatalogSeedData.cs`: `"megaphone"`, `"code"`, `"coins"`) is covered;
 * anything else — a future admin-entered key this map doesn't know about yet, or `null` — falls back to
 * a generic folder glyph rather than rendering nothing.
 */
const ICON_KEY_TO_NAME: Readonly<Record<string, string>> = {
  megaphone: 'phosphorMegaphone',
  code: 'phosphorCode',
  coins: 'phosphorCoins',
};

/** The icon set `resolveCategoryIconName` can return — register it with `provideIcons(CATEGORY_ICONS)` wherever
 *  a category icon is rendered, otherwise the glyph silently does not draw. */
export const CATEGORY_ICONS = { phosphorMegaphone, phosphorCode, phosphorCoins, phosphorFolder };

const FALLBACK_ICON_NAME = 'phosphorFolder';

export function resolveCategoryIconName(iconKey: string | null): string {
  if (iconKey === null) {
    return FALLBACK_ICON_NAME;
  }
  return ICON_KEY_TO_NAME[iconKey] ?? FALLBACK_ICON_NAME;
}
