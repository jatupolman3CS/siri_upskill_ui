import { CurrencyPipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CategoryTreeNode } from '../data/category-api.models';
import { CategoryApiService } from '../data/category-api.service';
import { SearchCoursesQuery, CourseSearchSort, SearchCoursesResponse } from '../data/course-api.models';
import { CourseApiService } from '../data/course-api.service';
import { findCategoryBySlug } from '../category-tree.util';
import { resolveCategoryIconName } from '../category-icon';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Button } from '../../../shared/button/button';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { InputField } from '../../../shared/input/input';
import { Pagination } from '../../../shared/pagination/pagination';
import { SelectField, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';

const PAGE_SIZE = 20;

const EMPTY_SEARCH_RESPONSE: SearchCoursesResponse = {
  results: { items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 },
  facets: { categories: [], levels: [] },
};

function toPositiveNumberOrNull(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Task P1-21 ("หน้า catalog + filter") — `/courses`, the destination every category link
 * (`CategoryMegaMenu`/`MobileNav`'s accordion, task P1-20) and eventually every course card
 * (task P1-22, not built yet — course cards here link to `/courses/{slug}`, which is a genuinely
 * dead link until then, same "build the real next dependent piece immediately" reasoning P1-20's own
 * `/courses` link already went through) points at.
 * <para>
 * <b>URL is the single source of truth for every filter</b> (docs/TASKS.md's own acceptance: "filter
 * sync กับ URL (กด back แล้วไม่รีเซ็ต)") — every filter value is a `computed()` read off
 * `route.queryParamMap`, never a separately-initialized local signal that could drift from it. Reading
 * a filter form control's value out again on `(change)`/`(blur)` and calling `router.navigate(...,
 * {queryParamsHandling: 'merge'})` is the only way any filter ever changes; the reverse direction (URL
 * changed externally — back/forward, a pasted link) pushes into the form controls via one `effect()`
 * with `emitEvent: false`, specifically so that push can never itself trigger a second navigation and
 * loop. Changing any filter except the page number itself always clears `page` back to unset (page 1)
 * — showing page 5 of a brand new filter set is never the right result.
 * </para>
 * <para>
 * Category filtering needs the real `CategoryTreeNode.id`, but the URL (and `CategoryMegaMenu`'s own
 * links) use the human-readable `slug` — resolved via `findCategoryBySlug` against a `categoriesResource`
 * fetched here independently of `SiteHeader`'s own copy (a second, harmless network round trip; the
 * backend's own 1-hour Redis cache means this is cheap, and introducing a client-side cache to share
 * one copy across unrelated components isn't justified by this alone). `courseSearchResource`'s own
 * `params()` deliberately returns `undefined` (skipping the fetch — see `rxResource`'s own
 * `Exclude<R, undefined>` in its loader params type) whenever a category slug is present in the URL but
 * the category tree hasn't resolved yet, so a category-filtered link never flashes an unfiltered result
 * for one request while the id lookup is still pending.
 * </para>
 */
@Component({
  selector: 'app-courses-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    CurrencyThbPipe,
    Button,
    EmptyState,
    InputField,
    NgOptimizedImage,
    Pagination,
    SelectField,
    Skeleton,
  ],
  templateUrl: './courses-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // CurrencyThbPipe's own inject(CurrencyPipe) needs this — Angular's built-in CurrencyPipe is not
  // providedIn: 'root' (same reason DevicesPage's own DatePipe usage already needed this exact fix).
  providers: [CurrencyPipe],
})
export class CoursesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseApi = inject(CourseApiService);
  private readonly categoryApi = inject(CategoryApiService);
  protected readonly translation = inject(TranslationService);

  protected readonly resolveIconName = resolveCategoryIconName;

  private readonly queryParamMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  protected readonly searchText = computed(() => this.queryParamMap().get('q') ?? '');
  protected readonly categorySlug = computed(() => this.queryParamMap().get('category'));
  protected readonly level = computed(() => this.queryParamMap().get('level'));
  protected readonly minPrice = computed(() => toPositiveNumberOrNull(this.queryParamMap().get('minPrice')));
  protected readonly maxPrice = computed(() => toPositiveNumberOrNull(this.queryParamMap().get('maxPrice')));
  protected readonly minRating = computed(() => toPositiveNumberOrNull(this.queryParamMap().get('minRating')));
  protected readonly sort = computed<CourseSearchSort>(() => (this.queryParamMap().get('sort') as CourseSearchSort | null) ?? 'Relevance');
  protected readonly page = computed(() => Math.max(1, Number(this.queryParamMap().get('page') ?? '1') || 1));

  protected readonly hasActiveFilters = computed(
    () =>
      !!this.searchText() ||
      !!this.categorySlug() ||
      !!this.level() ||
      this.minPrice() !== null ||
      this.maxPrice() !== null ||
      this.minRating() !== null,
  );

  protected readonly categoriesResource = rxResource({
    stream: () => this.categoryApi.getCategoryTree(),
    defaultValue: [] as readonly CategoryTreeNode[],
  });

  /** Guarded read — `defaultValue` above only covers the loading/idle period, it does NOT make
   *  `.value()` safe to read once the resource has genuinely settled into an error state (`.value()`
   *  throws there regardless — see `CourseDetailPage`'s own doc comment for where this was first
   *  discovered). A categories-fetch failure degrades `categoryId`/`activeCategory` below to "no match",
   *  the same treatment `findCategoryBySlug` already gives an unrecognized slug — not a crash. */
  protected readonly categories = computed(() =>
    this.categoriesResource.hasValue() ? this.categoriesResource.value() : ([] as readonly CategoryTreeNode[]),
  );

  protected readonly categoryId = computed(() => {
    const slug = this.categorySlug();
    return slug ? findCategoryBySlug(this.categories(), slug)?.id : undefined;
  });

  protected readonly activeCategory = computed(() => {
    const slug = this.categorySlug();
    return slug ? findCategoryBySlug(this.categories(), slug) : undefined;
  });

  protected readonly courseSearchResource = rxResource({
    params: (): SearchCoursesQuery | undefined => {
      if (this.categorySlug() && this.categoriesResource.isLoading()) {
        return undefined;
      }
      return {
        q: this.searchText() || undefined,
        categoryId: this.categoryId(),
        level: (this.level() as SearchCoursesQuery['level']) ?? undefined,
        minPrice: this.minPrice() ?? undefined,
        maxPrice: this.maxPrice() ?? undefined,
        minRating: this.minRating() ?? undefined,
        sort: this.sort(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      };
    },
    stream: ({ params }) => this.courseApi.searchCourses(params),
    defaultValue: EMPTY_SEARCH_RESPONSE,
  });

  /** Guarded read, same reasoning as `categories` above — `courseSearchResource` is this page's primary
   *  content (unlike the categories sidebar filter), so unlike `categories` its error state gets its own
   *  dedicated UI (see the `courseSearchResource.error()` branch in the template) rather than silently
   *  collapsing into "zero results"; this computed only supplies a safe value for the reads that happen
   *  outside/alongside that branch (the result count, the results grid, pagination). */
  protected readonly searchResult = computed(() =>
    this.courseSearchResource.hasValue() ? this.courseSearchResource.value() : EMPTY_SEARCH_RESPONSE,
  );

  protected readonly skeletonCards = Array.from({ length: 6 }, (_, i) => i);

  protected readonly levelOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.translation.t('catalog.filters.levelAny') },
    { value: 'Beginner', label: this.translation.t('catalog.filters.levelBeginner') },
    { value: 'Intermediate', label: this.translation.t('catalog.filters.levelIntermediate') },
    { value: 'Advanced', label: this.translation.t('catalog.filters.levelAdvanced') },
    { value: 'AllLevels', label: this.translation.t('catalog.filters.levelAllLevels') },
  ]);

  protected readonly sortOptions = computed<SelectOption[]>(() => [
    { value: 'Relevance', label: this.translation.t('catalog.filters.sortRelevance') },
    { value: 'Newest', label: this.translation.t('catalog.filters.sortNewest') },
    { value: 'PriceAsc', label: this.translation.t('catalog.filters.sortPriceAsc') },
    { value: 'PriceDesc', label: this.translation.t('catalog.filters.sortPriceDesc') },
    { value: 'RatingDesc', label: this.translation.t('catalog.filters.sortRatingDesc') },
  ]);

  protected readonly ratingOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.translation.t('catalog.filters.ratingAny') },
    { value: '4', label: this.translation.t('catalog.filters.ratingAtLeast', { rating: 4 }) },
    { value: '3', label: this.translation.t('catalog.filters.ratingAtLeast', { rating: 3 }) },
    { value: '2', label: this.translation.t('catalog.filters.ratingAtLeast', { rating: 2 }) },
    { value: '1', label: this.translation.t('catalog.filters.ratingAtLeast', { rating: 1 }) },
  ]);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly levelControl = new FormControl('', { nonNullable: true });
  protected readonly sortControl = new FormControl<CourseSearchSort>('Relevance', { nonNullable: true });
  protected readonly minRatingControl = new FormControl('', { nonNullable: true });
  protected readonly minPriceControl = new FormControl('', { nonNullable: true });
  protected readonly maxPriceControl = new FormControl('', { nonNullable: true });

  constructor() {
    setPageMeta({
      title: this.translation.t('catalog.pageTitle'),
      description: this.translation.t('catalog.pageDescription'),
    });

    // URL -> controls only, never the other way via valueChanges (see this class's own doc comment
    // for why) — emitEvent: false is what keeps this direction from ever re-triggering itself.
    effect(() => {
      this.searchControl.setValue(this.searchText(), { emitEvent: false });
      this.levelControl.setValue(this.level() ?? '', { emitEvent: false });
      this.sortControl.setValue(this.sort(), { emitEvent: false });
      this.minRatingControl.setValue(this.minRating() !== null ? String(this.minRating()) : '', { emitEvent: false });
      this.minPriceControl.setValue(this.minPrice() !== null ? String(this.minPrice()) : '', { emitEvent: false });
      this.maxPriceControl.setValue(this.maxPrice() !== null ? String(this.maxPrice()) : '', { emitEvent: false });
    });
  }

  protected categoryName(node: CategoryTreeNode): string {
    return this.translation.locale() === 'th' ? node.nameTh : node.nameEn;
  }

  protected applySearch(): void {
    this.updateQueryParams({ q: this.searchControl.value.trim() || null, page: null });
  }

  protected applyLevelFilter(): void {
    this.updateQueryParams({ level: this.levelControl.value || null, page: null });
  }

  protected applySortFilter(): void {
    this.updateQueryParams({ sort: this.sortControl.value, page: null });
  }

  protected applyRatingFilter(): void {
    this.updateQueryParams({ minRating: this.minRatingControl.value || null, page: null });
  }

  protected applyPriceFilter(): void {
    this.updateQueryParams({
      minPrice: this.minPriceControl.value || null,
      maxPrice: this.maxPriceControl.value || null,
      page: null,
    });
  }

  protected toggleCategory(slug: string): void {
    this.updateQueryParams({ category: this.categorySlug() === slug ? null : slug, page: null });
  }

  protected onPageChange(page: number): void {
    this.updateQueryParams({ page });
  }

  protected clearAllFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected retrySearch(): void {
    this.courseSearchResource.reload();
  }

  private updateQueryParams(changes: Readonly<Record<string, string | number | null>>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
    });
  }
}
