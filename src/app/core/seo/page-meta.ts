import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { SeoService } from './seo.service';

/**
 * Small shared helper so every route sets a real `<title>`/meta description instead of the app's
 * default (frontend.md: "หน้า public ... ต้องตั้ง title/meta ... ครบ"), without six near-identical
 * `inject(Title)`/`inject(Meta)` call sites. `Title`/`Meta` are themselves SSR-safe (they write to
 * the server-rendered document during SSR and the real one after hydration), so no
 * `isPlatformBrowser` guard is needed here.
 * <para>
 * Must be called from an injection context (a component constructor/field initializer) — same rule
 * as any other `inject()` call.
 * </para>
 * <para>
 * `robots`, when passed `'noindex'`, marks a page that must never appear in search results — used by
 * `ConfirmEmailPage`/`ResetPasswordPage` (their URLs carry a one-time secret token in the query
 * string) and `DevicesPage` (session-bound, not a public page at all). Omitted entirely for pages
 * that ARE meant to be indexable (Register/Login/ForgotPassword) rather than emitting an explicit
 * `index` value — omission is already the correct, unambiguous default for those.
 * </para>
 * <para>
 * <b>Delegates to `SeoService` (task P1-24), not a separate title/meta implementation</b> — found the
 * hard way while building that service: a page using this smaller helper is reached by ordinary SPA
 * navigation (no full reload) from a page that previously called `SeoService.set()` directly (e.g.
 * `CourseDetailPage` → `/login` via the site header), and `SeoService`'s own canonical/OG/hreflang/
 * JSON-LD tags don't clear themselves — only the next `SeoService.set()` call clears them. Before this
 * delegation, `setPageMeta()` never called that cleanup at all, so a page using it could silently keep
 * showing the *previous* page's canonical URL, Open Graph tags, and structured data. Routing through
 * `SeoService.set()` here means every route in the app — whichever helper it calls — always leaves a
 * fully clean, correct SEO state behind for whatever comes next, without every one of this helper's
 * seven existing call sites needing to start passing a `path`: it's derived from `Router.url` (already
 * resolved to the current route by the time a component's constructor runs), with the query string
 * stripped — deliberately, since two of those seven pages carry a one-time secret token in their own
 * query string that must never end up baked into a canonical/OG URL.
 * </para>
 */
export function setPageMeta(config: { readonly title: string; readonly description: string; readonly robots?: 'noindex' }): void {
  const router = inject(Router);
  const seoService = inject(SeoService);

  seoService.set({
    title: config.title,
    description: config.description,
    path: router.url.split('?')[0],
    robots: config.robots,
  });
}
