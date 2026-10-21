import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorFunnelSimple } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import type { PagedResult } from '../../../../core/http/paged-result.model';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { SeoService } from '../../../../core/seo/seo.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { InputField } from '../../../../shared/input/input';
import { Pagination } from '../../../../shared/pagination/pagination';
import { SelectField, SelectOption } from '../../../../shared/select/select';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import {
  TUTOR_SORTS,
  countTutorSearchFilters,
  hasTutorSearchFilters,
  parseTutorSearchQuery,
  toTutorSearchRequest,
  toTutorSearchRouteParams,
} from '../../data/tutor-search-query.util';
import { sortLabelKey } from '../../data/tutoring-labels';
import { tutoringErrorKey } from '../../data/tutoring-errors';
import { TutoringPublicApiService } from '../../data/tutoring-public-api.service';
import type { TutorSearchFacets, TutorSearchItem, TutorSearchQuery, TutorSort } from '../../data/tutoring-public.models';
import { TutorCard } from '../tutor-card/tutor-card';
import { TutorSearchFilters } from './tutor-search-filters/tutor-search-filters';

const EMPTY_RESULTS: PagedResult<TutorSearchItem> = { items: [], totalCount: 0, page: 1, pageSize: 12, totalPages: 0 };

/**
 * `/tutors` (P13-20) - public tutor search, rendered on the server and indexable.
 * <para>
 * <b>The URL is the single source of truth for every filter, sort and page</b> (pressing Back must not reset them): all
 * values are `computed()` reads of `route.queryParamMap`, and every change is a `router.navigate` that replaces the whole
 * query string. The form controls are fed from the URL by effects with `emitEvent: false` so that direction can never
 * navigate again. Any filter change drops `page` (the filter component never emits one).
 * </para>
 * <para>
 * Canonical is always the bare `/tutors` - filtered, sorted and paged variants are alternate views of the same list, and
 * indexing each would be near-duplicate content (same decision proposed for `/courses`). Facets are requested only on
 * page 1 (they do not depend on the page); the previous facets are kept while later pages load so the filter counts
 * do not blink away.
 * </para>
 */
@Component({
  selector: 'app-tutors-page',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    TranslatePipe,
    Button,
    EmptyState,
    InputField,
    Pagination,
    SelectField,
    Skeleton,
    TutorCard,
    TutorSearchFilters,
  ],
  templateUrl: './tutors-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorFunnelSimple })],
})
export class TutorsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TutoringPublicApiService);
  private readonly seo = inject(SeoService);
  protected readonly translation = inject(TranslationService);

  private readonly queryParamMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly query = computed<TutorSearchQuery>(() => parseTutorSearchQuery(this.queryParamMap()));
  protected readonly page = computed(() => this.query().page ?? 1);
  protected readonly hasFilters = computed(() => hasTutorSearchFilters(this.query()));
  protected readonly activeFilterCount = computed(() => countTutorSearchFilters(this.query()));

  protected readonly searchResource = rxResource({
    params: () => toTutorSearchRequest(this.query()),
    stream: ({ params }) => this.api.searchTutors(params),
  });
  /** Guarded read: `.value()` throws while the resource is in its error state, so every read goes through `hasValue()`. */
  private readonly searchResponse = computed(() => (this.searchResource.hasValue() ? this.searchResource.value() : null));
  protected readonly results = computed(() => this.searchResponse()?.results ?? EMPTY_RESULTS);
  protected readonly facets = linkedSignal<TutorSearchFacets | null, TutorSearchFacets | null>({
    source: () => this.searchResponse()?.facets ?? null,
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  protected readonly searchErrorKey = computed(() => tutoringErrorKey(this.searchResource.error() as ApiError | undefined));

  /** Subjects only feed the filter select; a failed load degrades to "no subject options", never to a broken page. */
  private readonly subjectsResource = rxResource({ stream: () => this.api.listSubjects() });
  protected readonly subjects = computed(() => (this.subjectsResource.hasValue() ? this.subjectsResource.value().items : []));

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly sortControl = new FormControl<TutorSort>('relevance', { nonNullable: true });
  protected readonly sortOptions = computed<SelectOption[]>(() =>
    TUTOR_SORTS.map((sort) => ({ value: sort, label: this.translation.t(sortLabelKey(sort)) })),
  );

  /** Mobile only: the filter panel is collapsed behind a button; from `lg` it is always shown (CSS, no JS breakpoint). */
  protected readonly filtersOpen = signal(false);
  protected readonly skeletonCards = Array.from({ length: 6 }, (_, index) => index);

  constructor() {
    effect(() => {
      const appName = this.translation.t('common.appName');
      this.seo.set({
        title: `${this.translation.t('tutoring.public.search.pageTitle')} | ${appName}`,
        description: this.translation.t('tutoring.public.search.pageDescription'),
        path: '/tutors',
      });
    });

    effect(() => {
      this.searchControl.setValue(this.query().q ?? '', { emitEvent: false });
      this.sortControl.setValue(this.query().sort ?? 'relevance', { emitEvent: false });
    });

    this.sortControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((sort) => this.navigate({ ...this.withoutPage(), sort }));
  }

  protected submitSearch(): void {
    this.navigate({ ...this.withoutPage(), q: this.searchControl.value.trim() || undefined });
  }

  protected applyFilters(next: TutorSearchQuery): void {
    this.navigate(next);
  }

  protected goToPage(page: number): void {
    this.navigate({ ...this.query(), page });
  }

  protected clearAll(): void {
    this.navigate({});
  }

  protected retry(): void {
    this.searchResource.reload();
  }

  protected toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  private withoutPage(): TutorSearchQuery {
    return { ...this.query(), page: undefined };
  }

  private navigate(next: TutorSearchQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toTutorSearchRouteParams(next) });
  }
}
