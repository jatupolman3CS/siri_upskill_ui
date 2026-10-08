import { CurrencyPipe, DatePipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { of } from 'rxjs';
import {
  phosphorArrowRight,
  phosphorArrowUUpLeft,
  phosphorBookOpen,
  phosphorCaretDown,
  phosphorCertificate,
  phosphorCheck,
  phosphorClock,
  phosphorDevices,
  phosphorEye,
  phosphorHeart,
  phosphorInfinity,
  phosphorPlayCircle,
  phosphorShoppingCart,
  phosphorStar,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';
import { phosphorHeartFill, phosphorPlayFill } from '@ng-icons/phosphor-icons/fill';

import { CategoryTreeNode } from '../data/category-api.models';
import { CategoryApiService } from '../data/category-api.service';
import { CourseDetailResponse, CourseDetailSection, CourseLevel } from '../data/course-api.models';
import { CourseApiService } from '../data/course-api.service';
import { WishlistStore } from '../data/wishlist.store';
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
import { CartStore } from '../../commerce/cart/cart-store.service';
import { CourseLiveSchedule } from './course-live/course-live-schedule';
import { CourseLiveSummary } from './course-live/course-live-summary';

/**
 * `/courses/:slug` (task P1-22) — the destination every course card (`CoursesPage`, P1-21) and
 * `CategoryMegaMenu`'s own indirect "ดูคอร์สทั้งหมด" path already point at.
 */
@Component({
  selector: 'app-course-detail-page',
  imports: [RouterLink, TranslatePipe, CurrencyThbPipe, DurationPipe, DatePipe, NgIcon, NgOptimizedImage, Breadcrumb, Button, Skeleton, CourseLiveSchedule, CourseLiveSummary],
  templateUrl: './course-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
    DatePipe,
    provideIcons({
      phosphorArrowRight,
      phosphorArrowUUpLeft,
      phosphorBookOpen,
      phosphorCaretDown,
      phosphorCertificate,
      phosphorCheck,
      phosphorClock,
      phosphorDevices,
      phosphorEye,
      phosphorHeart,
      phosphorHeartFill,
      phosphorInfinity,
      phosphorPlayCircle,
      phosphorPlayFill,
      phosphorShoppingCart,
      phosphorStar,
      phosphorUsers,
    }),
  ],
})
export class CourseDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseApi = inject(CourseApiService);
  private readonly categoryApi = inject(CategoryApiService);
  private readonly seoService = inject(SeoService);
  protected readonly cart = inject(CartStore);
  protected readonly wishlistStore = inject(WishlistStore);
  protected readonly translation = inject(TranslationService);
  protected readonly auth = inject(AuthService);

  protected readonly isWishlisted = computed(() => {
    const course = this.courseResource.value();
    if (!course) return false;
    return this.wishlistStore.isWishlisted(course.id);
  });

  protected toggleWishlist(): void {
    const course = this.courseResource.value();
    if (!course) return;
    this.wishlistStore.toggleWishlist({
      id: course.id,
      slug: course.slug,
      title: course.title,
      price: course.price,
      thumbnailUrl: course.thumbnailUrl,
      instructorName: course.instructor.displayName,
    });
  }

  protected readonly isAddedToCart = computed(() => {
    const course = this.courseResource.value();
    if (!course) return false;
    return this.cart.items().some((i) => i.courseId === course.id);
  });

  protected addToCart(): void {
    const course = this.courseResource.value();
    if (!course) return;
    this.cart.addItem({
      courseId: course.id,
      title: course.title,
      slug: course.slug,
      price: course.price,
      thumbnailUrl: course.thumbnailUrl,
      instructorName: course.instructor?.displayName,
    });
  }

  protected buyNow(): void {
    this.addToCart();
    this.router.navigate(['/cart']);
  }

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

  // Reviews are secondary content: a failed reviews fetch (or a failed course fetch, which this params
  // reads) must degrade to "no reviews", never throw. `.value()` throws while a resource is in the error
  // state, so every read below goes through `hasValue()` first.
  protected readonly reviewsResource = rxResource({
    params: () => (this.courseResource.hasValue() ? this.courseResource.value().id : undefined),
    stream: ({ params: courseId }) => {
      if (!courseId) return of(null);
      return this.courseApi.getCourseReviews(courseId, 1, 20);
    },
  });

  protected readonly reviewsSummary = computed(() => (this.reviewsResource.hasValue() ? this.reviewsResource.value() : undefined));
  protected readonly reviews = computed(() => this.reviewsSummary()?.items ?? []);

  protected readonly ratingDistribution = computed(() => {
    const summary = this.reviewsSummary();
    const total = summary?.ratingCount ?? 0;
    const dist = summary?.distribution;
    if (!dist || total === 0) {
      return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0, percent: 0 }));
    }

    const counts: Record<number, number> = {
      5: dist.star5,
      4: dist.star4,
      3: dist.star3,
      2: dist.star2,
      1: dist.star1,
    };

    return [5, 4, 3, 2, 1].map((stars) => {
      const count = counts[stars] ?? 0;
      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
      return { stars, count, percent };
    });
  });

  protected readonly discountPercent = computed(() => {
    const course = this.courseResource.value();
    if (!course || !course.comparePrice || course.comparePrice <= course.price) return 0;
    return Math.round(((course.comparePrice - course.price) / course.comparePrice) * 100);
  });

  protected readonly freePreviewCount = computed(() => {
    const course = this.courseResource.value();
    if (!course) return 0;
    return course.sections.flatMap((s) => s.episodes).filter((e) => e.isFreePreview).length;
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
