import { Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';

export type FilterPatch = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** The query string as the single source of truth for a list's filters and page (pressing Back must not reset them). */
export interface UrlFilters {
  readonly params: Signal<ParamMap>;
  /** The current page, 1-based; anything that is not a positive whole number reads as 1. */
  readonly page: Signal<number>;
  get(key: string): string | null;
  /**
   * Changes the query string, keeping the rest. `null`, `undefined`, `false` and `''` remove a key. Anything but a plain page
   * change also drops `page`, because page 5 of a new filter is never what the person means.
   */
  navigate(patch: FilterPatch, options?: { readonly keepPage?: boolean }): void;
}

export function parsePage(raw: string | null): number {
  const parsed = Number(raw ?? '1');
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/** Only `true` / `1` switch a flag on; a hand-edited URL with anything else reads as off. */
export function parseFlag(raw: string | null): boolean {
  return raw === 'true' || raw === '1';
}

/** `raw` when it is one of `allowed`, otherwise `null` - a hand-edited URL never reaches the API as an unknown enum value. */
export function parseOneOf<T extends string>(raw: string | null, allowed: readonly T[]): T | null {
  return allowed.find((value) => value === raw) ?? null;
}

/** Call from a constructor / field initializer (it injects the route and the router). */
export function injectUrlFilters(): UrlFilters {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const params = toSignal(route.queryParamMap, { initialValue: route.snapshot.queryParamMap });

  return {
    params,
    page: computed(() => parsePage(params().get('page'))),
    get: (key) => params().get(key),
    navigate: (patch, options) => {
      const queryParams: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(patch)) {
        queryParams[key] = value === null || value === undefined || value === false || value === '' ? null : String(value);
      }
      if (!options?.keepPage && !('page' in patch)) {
        queryParams['page'] = null;
      }
      void router.navigate([], { relativeTo: route, queryParams, queryParamsHandling: 'merge' });
    },
  };
}
