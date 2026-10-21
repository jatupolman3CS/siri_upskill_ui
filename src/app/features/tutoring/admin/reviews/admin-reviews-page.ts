import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorStarFill } from '@ng-icons/phosphor-icons/fill';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { InputField } from '../../../../shared/input/input';
import { Pagination } from '../../../../shared/pagination/pagination';
import { SelectField, type SelectOption } from '../../../../shared/select/select';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { tutoringAdminErrorKey } from '../data/admin-errors';
import { ADMIN_REVIEW_STATUSES, reviewStatusView } from '../data/admin-labels';
import { AdminReviewApiService } from '../data/admin-review-api.service';
import type { AdminReviewListItem, ReviewStatus } from '../../data/tutoring-review.models';
import { formatReviewerLabel } from '../../data/tutoring-review.util';
import { AdminChip } from '../ui/admin-chip';
import { AdminTutoringNav } from '../ui/admin-tutoring-nav';
import { injectUrlFilters, parseOneOf } from '../ui/url-filters';
import { ReviewModerationDialog } from './review-moderation-dialog/review-moderation-dialog';

const PAGE_SIZE = 20;
const SEARCH_MAX = 100;
const VALID_RATINGS = ['1', '2', '3', '4', '5'] as const;

@Component({
  selector: 'app-admin-reviews-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    TranslatePipe,
    BangkokDatePipe,
    Button,
    EmptyState,
    InputField,
    Pagination,
    SelectField,
    Skeleton,
    AdminChip,
    AdminTutoringNav,
    ReviewModerationDialog,
  ],
  templateUrl: './admin-reviews-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorStarFill })],
})
export class AdminReviewsPage {
  private readonly api = inject(AdminReviewApiService);
  private readonly i18n = inject(TranslationService);
  private readonly filters = injectUrlFilters();

  protected readonly status = computed<ReviewStatus | null>(() =>
    parseOneOf(this.filters.get('status'), ADMIN_REVIEW_STATUSES),
  );
  protected readonly rating = computed<number | null>(() => {
    const raw = parseOneOf(this.filters.get('rating'), VALID_RATINGS);
    return raw !== null ? Number.parseInt(raw, 10) : null;
  });
  protected readonly search = computed(() => (this.filters.get('q') ?? '').slice(0, SEARCH_MAX));
  protected readonly page = this.filters.page;
  protected readonly hasFilters = computed(() => this.status() !== null || this.rating() !== null || this.search() !== '');

  protected readonly statusControl = new FormControl('', { nonNullable: true });
  protected readonly ratingControl = new FormControl('', { nonNullable: true });
  protected readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly statusOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.i18n.t('tutoring.admin.reviews.statusAll') },
    ...ADMIN_REVIEW_STATUSES.map((status) => ({
      value: status,
      label: this.i18n.t(`tutoring.enums.reviewStatus.${status}`),
    })),
  ]);

  protected readonly ratingOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.i18n.t('tutoring.admin.reviews.ratingAll') },
    { value: '5', label: this.i18n.t('tutoring.admin.reviews.ratingStars', { stars: 5 }) },
    { value: '4', label: this.i18n.t('tutoring.admin.reviews.ratingStars', { stars: 4 }) },
    { value: '3', label: this.i18n.t('tutoring.admin.reviews.ratingStars', { stars: 3 }) },
    { value: '2', label: this.i18n.t('tutoring.admin.reviews.ratingStars', { stars: 2 }) },
    { value: '1', label: this.i18n.t('tutoring.admin.reviews.ratingStars', { stars: 1 }) },
  ]);

  private readonly reviewsResource = rxResource({
    params: () => ({
      status: this.status(),
      rating: this.rating(),
      search: this.search(),
      page: this.page(),
    }),
    stream: ({ params }) =>
      this.api.listReviews({
        status: params.status ?? undefined,
        rating: params.rating ?? undefined,
        search: params.search || undefined,
        page: params.page,
        pageSize: PAGE_SIZE,
      }),
  });

  protected readonly items = computed<readonly AdminReviewListItem[]>(() =>
    this.reviewsResource.hasValue() ? this.reviewsResource.value().items : [],
  );
  protected readonly totalPages = computed(() =>
    this.reviewsResource.hasValue() ? this.reviewsResource.value().totalPages : 1,
  );
  protected readonly totalCount = computed(() =>
    this.reviewsResource.hasValue() ? this.reviewsResource.value().totalCount : 0,
  );
  protected readonly isLoading = computed(() => this.reviewsResource.isLoading() && !this.reviewsResource.hasValue());
  protected readonly hasError = computed(() => this.reviewsResource.status() === 'error');
  protected readonly errorKey = computed(() =>
    this.hasError() ? tutoringAdminErrorKey(this.reviewsResource.error()) : '',
  );
  protected readonly statusView = reviewStatusView;

  // Moderation dialog state
  protected readonly dialogOpen = signal(false);
  protected readonly dialogMode = signal<'hide' | 'unhide'>('hide');
  protected readonly selectedReview = signal<AdminReviewListItem | null>(null);

  constructor() {
    trackStudioMeta('tutoring.admin.reviews.pageTitle', 'tutoring.admin.reviews.pageDescription', () => '/admin/tutoring/reviews');

    effect(() => {
      this.statusControl.setValue(this.status() ?? '', { emitEvent: false });
      this.ratingControl.setValue(this.rating() !== null ? String(this.rating()) : '', { emitEvent: false });
      this.searchControl.setValue(this.search(), { emitEvent: false });
    });
  }

  protected applyStatus(): void {
    this.filters.navigate({ status: this.statusControl.value || null });
  }

  protected applyRating(): void {
    this.filters.navigate({ rating: this.ratingControl.value || null });
  }

  protected applySearch(): void {
    const trimmed = this.searchControl.value.trim().slice(0, SEARCH_MAX);
    this.filters.navigate({ q: trimmed || null });
  }

  protected clearFilters(): void {
    this.filters.navigate({ status: null, rating: null, q: null });
  }

  protected goToPage(page: number): void {
    this.filters.navigate({ page }, { keepPage: true });
  }

  protected reload(): void {
    this.reviewsResource.reload();
  }

  protected reviewerLabel(item: AdminReviewListItem): string {
    return formatReviewerLabel(
      { kind: item.reviewerKind, nickname: item.reviewerNickname, gradeBand: item.reviewerGradeBand },
      this.i18n,
    );
  }

  protected openHide(item: AdminReviewListItem): void {
    this.selectedReview.set(item);
    this.dialogMode.set('hide');
    this.dialogOpen.set(true);
  }

  protected openUnhide(item: AdminReviewListItem): void {
    this.selectedReview.set(item);
    this.dialogMode.set('unhide');
    this.dialogOpen.set(true);
  }

  protected onModerated(): void {
    this.reviewsResource.reload();
  }
}
