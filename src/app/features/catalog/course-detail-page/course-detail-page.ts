import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorBookOpen,
  phosphorCaretDown,
  phosphorCheck,
  phosphorClock,
  phosphorPlayCircle,
  phosphorStar,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { CategoryTreeNode } from '../data/category-api.models';
import { CategoryApiService } from '../data/category-api.service';
import { CourseDetailResponse, CourseDetailSection, CourseLevel } from '../data/course-api.models';
import { CourseApiService } from '../data/course-api.service';
import { findCategoryById } from '../category-tree.util';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { DurationPipe } from '../../../core/i18n/duration.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { buildBreadcrumbListJsonLd, buildCourseJsonLd } from '../../../core/seo/schema-org.util';
import { SeoService } from '../../../core/seo/seo.service';
import { Breadcrumb, BreadcrumbItem } from '../../../shared/breadcrumb/breadcrumb';
import { Button } from '../../../shared/button/button';
import { Skeleton } from '../../../shared/skeleton/skeleton';

/**
 * `/courses/:slug` (task P1-22) — the destination every course card (`CoursesPage`, P1-21) and
 * `CategoryMegaMenu`'s own indirect "ดูคอร์สทั้งหมด" path already point at. Public + SSR-indexable
 * (default `RenderMode.Server` in `app.routes.server.ts` — no override needed, same reasoning
 * `/register`/`/login` already established: nothing here is session-dependent, `GetCourseDetailEndpoint`
 * is `.AllowAnonymous()`).
 * <para>
 * <b>Full SEO via `SeoService`</b> (task P1-24) — title, description, canonical, Open Graph, hreflang,
 * and `Course`+`BreadcrumbList` JSON-LD, all set from one `effect()` reacting to `courseResource`
 * (not the smaller `setPageMeta()` helper — that one assumes synchronous, constructor-time values;
 * this page's title/JSON-LD depend on the fetched course). The not-found branch calls `SeoService`
 * too (title + `robots: noindex`, no JSON-LD), and so does `hasOtherError()` — every branch calls
 * `SeoService.set()` exactly once per effect run, always for the *current* `path`, so neither a
 * client-side navigation into a 404 nor a same-route slug change that fails (Angular reuses this
 * component across `/courses/courseA` → `/courses/courseB`) can leave a previous course's canonical/
 * OG/JSON-LD attached to a page that no longer shows that course — `SeoService.set()` itself always
 * clears what a call doesn't re-add. `aggregateRating` in the `Course` JSON-LD is only emitted once
 * `ratingCount > 0` — see
 * `buildCourseJsonLd`'s own doc comment for why (every course's `ratingCount` is genuinely 0 today).
 * </para>
 * <para>
 * <b>The buy button is disabled everywhere, not routed anywhere</b> — Commerce (Cart/Order/Checkout,
 * P3) does not exist yet in this codebase at all, for any user, authenticated or not. Routing an
 * unauthenticated visitor to `/register` on click (mirroring `HomePage`'s hero CTA) would imply
 * registering leads somewhere buyable, which is not true yet; a plain disabled button with an
 * explanatory caption is the honest state until P3 lands. The same reasoning applies to free-preview
 * episodes: they carry a badge (the acceptance criterion) but are not clickable — there is no player
 * to send them to until Phase 2.
 * </para>
 * <para>
 * <b>No review list, only the rating summary</b> — `CourseDetailResponse` only carries
 * `ratingAverage`/`ratingCount` (denormalized fields updated by a not-yet-built
 * `CourseStatsUpdater`, per `Course.cs`'s own doc comment); there is no endpoint for individual
 * reviews. Writing a review is task P1-08, itself blocked on `Enrollments` not existing yet (Learning
 * module). Every seeded course's `ratingCount` is 0 today, so the "no reviews yet" state is what
 * actually renders right now — a true statement, not a placeholder.
 * </para>
 */
@Component({
  selector: 'app-course-detail-page',
  imports: [RouterLink, TranslatePipe, CurrencyThbPipe, DurationPipe, NgIcon, Breadcrumb, Button, Skeleton],
  templateUrl: './course-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // CurrencyPipe: CurrencyThbPipe's own inject(CurrencyPipe) needs this — Angular's built-in
  // CurrencyPipe is not providedIn: 'root' (same reason CoursesPage/DevicesPage already needed this).
  providers: [
    CurrencyPipe,
    provideIcons({
      phosphorBookOpen,
      phosphorCaretDown,
      phosphorCheck,
      phosphorClock,
      phosphorPlayCircle,
      phosphorStar,
      phosphorUsers,
    }),
  ],
})
export class CourseDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly courseApi = inject(CourseApiService);
  private readonly categoryApi = inject(CategoryApiService);
  private readonly seoService = inject(SeoService);
  protected readonly translation = inject(TranslationService);
  protected readonly auth = inject(AuthService);

  private readonly paramMap = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly slug = computed(() => this.paramMap().get('slug') ?? '');

  // No `defaultValue` — `CourseDetailResponse` has no meaningful "empty" instance to construct
  // (unlike `CoursesPage`'s own `EMPTY_SEARCH_RESPONSE`), so `.value()` is `CourseDetailResponse |
  // undefined` here: `undefined` while loading/idle, the real course once resolved, and — per this
  // type's own doc comment — throws only while `status()` is `'error'`. Every read of `.value()`
  // below happens after `isNotFound()`/`hasOtherError()` (both derived from the same `.error()`
  // signal) have already been checked false in the same `@if`/`@else if` chain, so that throw is
  // never reached.
  protected readonly courseResource = rxResource({
    params: () => this.slug(),
    stream: ({ params }) => this.courseApi.getCourseDetail(params),
  });

  protected readonly categoriesResource = rxResource({
    stream: () => this.categoryApi.getCategoryTree(),
    defaultValue: [] as readonly CategoryTreeNode[],
  });

  private readonly resourceError = computed(() => this.courseResource.error() as ApiError | undefined);
  protected readonly isNotFound = computed(() => this.resourceError()?.status === 404);
  protected readonly hasOtherError = computed(() => {
    const error = this.resourceError();
    return error !== undefined && error.status !== 404;
  });

  protected readonly breadcrumbItems = computed<readonly BreadcrumbItem[]>(() => {
    const course = this.courseResource.value();
    if (!course) {
      return [];
    }

    const items: BreadcrumbItem[] = [
      { label: this.translation.t('nav.home'), href: '/' },
      { label: this.translation.t('catalog.heading'), href: '/courses' },
    ];

    // hasValue() first — categoriesResource's own `defaultValue` does NOT make `.value()` safe to
    // read once it's genuinely settled into an error state (a categories-fetch failure while the
    // course itself loaded fine would otherwise throw here, poisoning this whole computed() — it
    // caches the throw and rethrows on every future read until a dependency changes). Missing
    // categories just means the breadcrumb quietly skips the category crumb, not a broken page.
    const category = this.categoriesResource.hasValue()
      ? findCategoryById(this.categoriesResource.value(), course.categoryId)
      : undefined;
    if (category) {
      items.push({
        label: this.translation.locale() === 'th' ? category.nameTh : category.nameEn,
        href: '/courses',
        queryParams: { category: category.slug },
      });
    }

    items.push({ label: course.title });
    return items;
  });

  // A section is expanded when "default expanded (first section only)" is flipped an odd number of
  // times by toggling — see this class's own doc comment on isSectionExpanded for why this needs no
  // seeding effect. Never mutated in place (project convention — .set()/.update() with a fresh Set).
  private readonly toggledSectionIds = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // Dynamic SEO — see this class's own doc comment for why setPageMeta() (built for static,
    // constructor-time values) isn't used here instead. `isNotFound()`/`hasOtherError()` MUST be
    // checked before `courseResource.value()` is read here, not after — unlike the template's own
    // `@if`/`@else if` chain (which short-circuits before ever reaching a `.value()` read once one of
    // those branches matches), a plain `effect()` body has no such short-circuit: reading `.value()`
    // unconditionally throws whenever `status()` is `'error'`, discovered directly by this effect
    // crashing on every 404 until this guard was added (see P1-22's own history for the incident).
    //
    // Every branch below calls `seoService.set()` exactly once, for THIS run's own `path` — including
    // `hasOtherError()`, which used to just `return` and leave whatever SEO state the previous run
    // left behind. That was fine for a retry of the *same* course (the stale title/canonical/JSON-LD
    // still described the right thing), but Angular reuses this component instance across
    // `/courses/courseA` → `/courses/courseB` (same route, only `:slug` changes) — if courseB's fetch
    // fails, "leave it alone" meant the page kept claiming to be courseA's canonical URL and
    // structured data while the address bar and visible UI already showed courseB's error. Always
    // re-asserting a path-correct (if generic) SEO state on every run — even a failing one — costs a
    // one-line title flicker on a transient retry and closes that mismatch entirely.
    effect(() => {
      const appName = this.translation.t('common.appName');
      const path = `/courses/${this.slug()}`;

      if (this.isNotFound()) {
        this.seoService.set({
          title: `${this.translation.t('catalog.detail.notFoundHeading')} | ${appName}`,
          description: this.translation.t('catalog.detail.notFoundDescription'),
          path,
          robots: 'noindex',
        });
        return;
      }

      if (this.hasOtherError()) {
        this.seoService.set({
          title: `${this.translation.t('catalog.detail.errorHeading')} | ${appName}`,
          description: this.translation.t('catalog.detail.fallbackDescription'),
          path,
          robots: 'noindex',
        });
        return;
      }

      const course = this.courseResource.value();
      if (!course) {
        return;
      }

      const description = course.seoDescription ?? course.subtitle ?? this.translation.t('catalog.detail.fallbackDescription');

      this.seoService.set({
        title: `${course.title} | ${appName}`,
        description,
        path,
        openGraph: { image: course.thumbnailUrl },
        jsonLd: [
          buildCourseJsonLd({
            name: course.title,
            description,
            url: this.seoService.absoluteUrl(path),
            image: course.thumbnailUrl,
            ratingAverage: course.ratingAverage,
            ratingCount: course.ratingCount,
            providerName: appName,
            providerUrl: this.seoService.absoluteUrl('/'),
          }),
          buildBreadcrumbListJsonLd(this.breadcrumbJsonLdItems(path)),
        ],
      });
    });
  }

  /** Same trail `breadcrumbItems()` renders, resolved to absolute URLs for the `BreadcrumbList`
   * JSON-LD (schema.org `item` values must be absolute) — the last item (current page, no `href` of
   * its own in `breadcrumbItems()`) resolves to `path` itself. */
  private breadcrumbJsonLdItems(path: string): readonly { readonly name: string; readonly url: string }[] {
    return this.breadcrumbItems().map((item) => {
      if (!item.href) {
        return { name: item.label, url: this.seoService.absoluteUrl(path) };
      }
      const query = item.queryParams ? `?${new URLSearchParams(item.queryParams).toString()}` : '';
      return { name: item.label, url: this.seoService.absoluteUrl(`${item.href}${query}`) };
    });
  }

  /** First section defaults open; every other section defaults closed — `toggledSectionIds` records
   * which sections have had that default flipped at least once (XOR), so no seeding effect is needed
   * to reach "first section open on initial load". */
  protected isSectionExpanded(section: CourseDetailSection, index: number): boolean {
    const defaultExpanded = index === 0;
    const wasToggled = this.toggledSectionIds().has(section.id);
    return defaultExpanded !== wasToggled;
  }

  protected toggleSection(sectionId: string): void {
    this.toggledSectionIds.update((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  protected levelLabel(level: CourseLevel): string {
    switch (level) {
      case 'Beginner':
        return this.translation.t('catalog.filters.levelBeginner');
      case 'Intermediate':
        return this.translation.t('catalog.filters.levelIntermediate');
      case 'Advanced':
        return this.translation.t('catalog.filters.levelAdvanced');
      case 'AllLevels':
      default:
        return this.translation.t('catalog.filters.levelAllLevels');
    }
  }

  protected languageLabel(language: CourseDetailResponse['language']): string {
    return language === 'Thai'
      ? this.translation.t('catalog.detail.languageThai')
      : this.translation.t('catalog.detail.languageEnglish');
  }

  protected accessDurationLabel(accessDurationDays: number | null): string {
    return accessDurationDays === null
      ? this.translation.t('catalog.detail.accessDurationLifetime')
      : this.translation.t('catalog.detail.accessDurationDays', { days: accessDurationDays });
  }

  protected instructorInitial(displayName: string): string {
    return displayName.trim().charAt(0).toUpperCase() || '?';
  }

  protected retry(): void {
    this.courseResource.reload();
  }
}
