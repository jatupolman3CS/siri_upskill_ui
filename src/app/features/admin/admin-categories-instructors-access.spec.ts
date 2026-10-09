import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Route, Router, UrlTree, provideRouter } from '@angular/router';

import { routes } from '../../app.routes';
import { buildTestAccessToken } from '../../core/auth/testing/test-jwt';
import { authGuard } from '../../core/guards/auth.guard';
import { roleGuard } from '../../core/guards/role.guard';
import { accessTokenStore } from '../../core/http/access-token.store';
import en from '../../core/i18n/en.json';
import th from '../../core/i18n/th.json';
import { ADMIN_NAV_LINKS } from '../../layouts/admin-layout/admin-nav';
import { AdminCategoriesPage } from './categories/admin-categories-page';
import { AdminInstructorsPage } from './instructors/admin-instructors-page';

function adminRoute(): Route {
  const route = routes.find((candidate) => candidate.path === 'admin');
  if (!route) {
    throw new Error('admin route missing');
  }
  return route;
}

function adminChild(path: string): Route | undefined {
  return adminRoute().children?.find((child) => child.path === path);
}

/** Flattens a dictionary subtree into `dot.path -> string` entries. */
function flatten(node: unknown, prefix: string, out: Map<string, string>): Map<string, string> {
  if (typeof node === 'string') {
    out.set(prefix, node);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function placeholders(text: string): string[] {
  return Array.from(text.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (match) => match[1]).sort();
}

describe('admin categories + instructor applications — routing and access', () => {
  describe('routes', () => {
    it('are lazy children of the admin shell, so they sit behind the same authGuard + roleGuard as every sibling', async () => {
      const parent = adminRoute();
      expect(parent.canActivate).toEqual([authGuard, roleGuard]);
      expect(parent.data).toEqual({ roles: ['Admin', 'SuperAdmin'] });

      const categories = adminChild('categories');
      const instructors = adminChild('instructors');
      expect(categories).toBeDefined();
      expect(instructors).toBeDefined();
      // No guard of their own to forget or weaken: they inherit the parent's.
      expect(categories?.canActivate).toBeUndefined();
      expect(instructors?.canActivate).toBeUndefined();

      expect(await (categories?.loadComponent as () => Promise<unknown>)()).toBe(AdminCategoriesPage);
      expect(await (instructors?.loadComponent as () => Promise<unknown>)()).toBe(AdminInstructorsPage);
    });
  });

  describe('roleGuard on the admin shell', () => {
    afterEach(() => accessTokenStore.set(null));

    function runGuard(roles: string[]): boolean | UrlTree {
      accessTokenStore.set(buildTestAccessToken({ userId: 'u-1', roles }));
      const snapshot = { data: adminRoute().data } as unknown as ActivatedRouteSnapshot;
      return TestBed.runInInjectionContext(() => roleGuard(snapshot, {} as never)) as boolean | UrlTree;
    }

    beforeEach(() => {
      accessTokenStore.set(null);
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
    });

    it('lets an Admin in', () => {
      expect(runGuard(['Admin'])).toBe(true);
    });

    it('sends an Instructor and a Learner back to the home page', () => {
      const router = TestBed.inject(Router);
      for (const roles of [['Instructor'], ['Learner']]) {
        const result = runGuard(roles);
        expect(result).not.toBe(true);
        expect(router.serializeUrl(result as UrlTree)).toBe('/');
      }
    });
  });

  describe('navigation', () => {
    it('lists both pages once, pointing at existing admin routes, with a label in both languages', () => {
      for (const [id, route] of [
        ['categories', '/admin/categories'],
        ['instructors', '/admin/instructors'],
      ] as const) {
        const entries = ADMIN_NAV_LINKS.filter((link) => link.id === id);
        expect(entries, id).toHaveLength(1);
        expect(entries[0].route).toBe(route);
        expect(adminChild(route.replace('/admin/', '')), route).toBeDefined();

        const labelKey = entries[0].labelKey.replace('admin.nav.', '');
        const navTh = (th.admin.nav as Record<string, string>)[labelKey];
        const navEn = (en.admin.nav as Record<string, string>)[labelKey];
        expect(navTh?.length, `th ${entries[0].labelKey}`).toBeGreaterThan(0);
        expect(navEn?.length, `en ${entries[0].labelKey}`).toBeGreaterThan(0);
      }
    });

    it('gives every nav entry a unique id and route (so the concurrent live-status entry and these never collide)', () => {
      const ids = ADMIN_NAV_LINKS.map((link) => link.id);
      const paths = ADMIN_NAV_LINKS.map((link) => link.route);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(paths).size).toBe(paths.length);
    });
  });

  describe('i18n parity (th + en)', () => {
    const namespaces: readonly (readonly [string, unknown, unknown])[] = [
      ['admin.categories', th.admin.categories, en.admin.categories],
      ['admin.instructors', th.admin.instructors, en.admin.instructors],
      ['instructor.builder.basic (no-category copy)', pick(th.instructor.builder.basic), pick(en.instructor.builder.basic)],
    ];

    function pick(basic: Record<string, string>): Record<string, string> {
      return Object.fromEntries(Object.entries(basic).filter(([key]) => key.startsWith('noCategories')));
    }

    for (const [name, thSubtree, enSubtree] of namespaces) {
      describe(name, () => {
        const thEntries = flatten(thSubtree, name, new Map());
        const enEntries = flatten(enSubtree, name, new Map());

        it('has exactly the same keys in Thai and English', () => {
          expect([...thEntries.keys()].sort()).toEqual([...enEntries.keys()].sort());
          expect(thEntries.size).toBeGreaterThan(0);
        });

        it('has no empty strings', () => {
          for (const [key, value] of [...thEntries, ...enEntries]) {
            expect(value.trim().length, `${key} is empty`).toBeGreaterThan(0);
          }
        });

        it('uses the same {{placeholders}} in both languages', () => {
          for (const [key, thText] of thEntries) {
            expect(placeholders(enEntries.get(key) ?? ''), key).toEqual(placeholders(thText));
          }
        });
      });
    }
  });
});
