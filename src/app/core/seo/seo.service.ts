import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SeoOpenGraph {
  readonly image?: string | null;
  readonly type?: 'website' | 'article';
}

export interface SeoConfig {
  readonly title: string;
  readonly description: string;
  /** Path only (e.g. `/courses/python-for-beginners`), no origin — `SeoService` builds the absolute
   * URL itself (see this file's own doc comment for why). Query strings are the caller's choice to
   * include or strip; `CoursesPage` deliberately strips them (see its own call site). */
  readonly path: string;
  readonly robots?: 'noindex';
  readonly openGraph?: SeoOpenGraph;
  /** Zero or more schema.org objects, each rendered as its own `<script type="application/ld+json">`
   * (simpler and more broadly supported than combining several types into one `@graph` array).
   * Omit/empty for pages with no structured data of their own — still call `set()` on such pages so
   * any JSON-LD left behind by a previous route is cleared. */
  readonly jsonLd?: readonly Readonly<Record<string, unknown>>[];
}

const JSON_LD_ATTR = 'data-seo-json-ld';
const HREFLANG_VALUES = ['th', 'en', 'x-default'] as const;

/**
 * Full public-page SEO (task P1-24): title/description (the same ground `setPageMeta()` already
 * covers), canonical URL, Open Graph tags, hreflang alternates, and JSON-LD structured data —
 * `frontend.md`'s own rule: "หน้า public (home, catalog, course detail, blog) ต้องตั้ง
 * title/meta/canonical/JSON-LD ครบ", deliberately deferred by `HomePage`/`CoursesPage`/
 * `CourseDetailPage` until this task existed.
 * <para>
 * <b>Not a replacement for `setPageMeta()`</b> — the auth pages and `/account/devices` keep using
 * that smaller helper unchanged. Canonical/OG/JSON-LD only make sense for real indexable content
 * pages, none of which are in `frontend.md`'s named list; retrofitting every `setPageMeta()` call
 * site is outside this task's scope.
 * </para>
 * <para>
 * <b>Canonical/OG URLs are built from `document.location.origin` at call time, not a configured
 * constant</b> — there is no production domain decided yet (`docs/DECISIONS.md`'s Q3 update says so
 * explicitly), so hardcoding one would be wrong today. `DOCUMENT` is Angular's own SSR-safe document
 * abstraction — the same one `Meta`/`Title` use internally — so during SSR this reflects the real
 * incoming request's host and (traced through `@angular/ssr`/`@angular/platform-server`'s own source,
 * not assumed) the real request path/query too. The **scheme** half is conditional, not automatic:
 * Angular derives `https` only from `X-Forwarded-Proto`/`Forwarded` when the server explicitly trusts
 * proxy headers (`NG_TRUST_PROXY_HEADERS`), else it falls back to the raw socket's own TLS state —
 * `false` for any TLS-terminating reverse proxy talking plain HTTP to this app internally, which is
 * exactly `docs/DEPLOYMENT.md`'s planned Caddy→Node topology. See that doc's own Caddy section for the
 * env var this needs at deploy time; there is no infra to misconfigure yet (P0's Caddy setup hasn't
 * happened), so this cannot silently produce a wrong scheme today, only once that infra exists.
 * </para>
 * <para>
 * <b>hreflang alternates all point at the same URL</b> — not an oversight: this app serves both
 * languages from one URL per page, switched at runtime by `TranslationService` (see that class's own
 * doc comment for why), not via separate `/en/...` routes. Google's hreflang guidance explicitly
 * supports this "one URL, multiple languages" case via self-referencing hreflang values instead of
 * omitting the tag.
 * </para>
 * <para>
 * JSON-LD structured data is a Google Search **eligibility** signal, not a guarantee — whether a
 * page actually renders as a rich result also depends on Google's own crawl/quality/trust criteria
 * this service has no control over. The shapes generated here (`Course`, `BreadcrumbList`,
 * `AggregateRating`) follow schema.org's stable core vocabulary; verifying live rich-result rendering
 * itself needs Google's own Rich Results Test against a deployed, crawlable URL, which doesn't exist
 * yet (no production domain).
 * </para>
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly document = inject(DOCUMENT);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);

  set(config: SeoConfig): void {
    this.titleService.setTitle(config.title);
    this.metaService.updateTag({ name: 'description', content: config.description });

    if (config.robots === 'noindex') {
      this.metaService.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    } else {
      this.metaService.removeTag('name="robots"');
    }

    const url = this.absoluteUrl(config.path);
    this.upsertLink('link[rel="canonical"]', { rel: 'canonical', href: url });

    this.metaService.updateTag({ property: 'og:title', content: config.title });
    this.metaService.updateTag({ property: 'og:description', content: config.description });
    this.metaService.updateTag({ property: 'og:type', content: config.openGraph?.type ?? 'website' });
    this.metaService.updateTag({ property: 'og:url', content: url });
    if (config.openGraph?.image) {
      this.metaService.updateTag({ property: 'og:image', content: config.openGraph.image });
    } else {
      this.metaService.removeTag('property="og:image"');
    }

    for (const hreflang of HREFLANG_VALUES) {
      this.upsertLink(`link[rel="alternate"][hreflang="${hreflang}"]`, { rel: 'alternate', hreflang, href: url });
    }

    this.setJsonLd(config.jsonLd ?? []);
  }

  /** Absolute URL for a path — exposed so callers (e.g. `CourseDetailPage`'s JSON-LD builder) can
   * resolve breadcrumb/entity URLs the same way `set()` resolves its own canonical/OG URL. */
  absoluteUrl(path: string): string {
    return `${this.document.location.origin}${path}`;
  }

  private upsertLink(selector: string, attrs: Readonly<Record<string, string>>): void {
    let link = this.document.head.querySelector(selector) as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      this.document.head.appendChild(link);
    }
    for (const [name, value] of Object.entries(attrs)) {
      link.setAttribute(name, value);
    }
  }

  private setJsonLd(items: readonly Readonly<Record<string, unknown>>[]): void {
    // Clear every script this service previously added — a page with fewer (or zero) JSON-LD objects
    // than the page navigated away from must not leave the old ones behind.
    this.document.querySelectorAll(`script[${JSON_LD_ATTR}]`).forEach((element) => element.remove());

    for (const item of items) {
      const script = this.document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute(JSON_LD_ATTR, '');
      script.textContent = JSON.stringify(item);
      this.document.head.appendChild(script);
    }
  }
}
