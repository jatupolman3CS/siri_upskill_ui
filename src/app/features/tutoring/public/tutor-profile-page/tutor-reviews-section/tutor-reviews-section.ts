import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorStarFill } from '@ng-icons/phosphor-icons/fill';
import { phosphorStar } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { localizedName } from '../../../data/tutoring-labels';
import { TutoringPublicApiService } from '../../../data/tutoring-public-api.service';
import type { PublicReviewer, PublicTutorReview, ReviewSort, TutorReviewsResponse, TutorReviewsSummary } from '../../../data/tutoring-review.models';
import { distributionPercentage, formatReviewerLabel } from '../../../data/tutoring-review.util';

export interface StarDistributionRow {
  readonly stars: number;
  readonly count: number;
  readonly percent: number;
}

@Component({
  selector: 'app-tutor-reviews-section',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, Button, EmptyState, Pagination, Skeleton],
  templateUrl: './tutor-reviews-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorStar, phosphorStarFill })],
  host: { class: 'block' },
})
export class TutorReviewsSection {
  readonly slug = input.required<string>();

  private readonly api = inject(TutoringPublicApiService);
  protected readonly translation = inject(TranslationService);

  private readonly inBrowser = signal(false);
  protected readonly Math = Math;

  readonly rating = signal<number | null>(null);
  readonly sort = signal<ReviewSort>('newest');
  readonly page = signal<number>(1);

  readonly reviewsResource = rxResource({
    params: () => {
      if (!this.inBrowser()) {
        return undefined;
      }
      return {
        slug: this.slug(),
        rating: this.rating() ?? undefined,
        sort: this.sort(),
        page: this.page(),
        pageSize: 10,
      };
    },
    stream: ({ params }) => this.api.getTutorReviews(params.slug, {
      rating: params.rating,
      sort: params.sort,
      page: params.page,
      pageSize: params.pageSize,
    }),
  });

  protected readonly response = computed<TutorReviewsResponse | null>(() =>
    this.reviewsResource.hasValue() ? this.reviewsResource.value() : null,
  );

  protected readonly summary = computed<TutorReviewsSummary | null>(() => this.response()?.summary ?? null);
  protected readonly items = computed<readonly PublicTutorReview[]>(() => this.response()?.reviews.items ?? []);
  protected readonly totalPages = computed<number>(() => this.response()?.reviews.totalPages ?? 1);
  protected readonly totalCount = computed<number>(() => this.response()?.reviews.totalCount ?? 0);
  protected readonly isLoading = computed<boolean>(() => this.reviewsResource.isLoading());
  protected readonly hasError = computed<boolean>(() => !!this.reviewsResource.error());

  protected readonly distribution = computed<readonly StarDistributionRow[]>(() => {
    const s = this.summary();
    const total = s?.ratingCount ?? 0;
    const dist = s?.distribution ?? { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 };
    return [
      { stars: 5, count: dist.star5, percent: distributionPercentage(dist.star5, total) },
      { stars: 4, count: dist.star4, percent: distributionPercentage(dist.star4, total) },
      { stars: 3, count: dist.star3, percent: distributionPercentage(dist.star3, total) },
      { stars: 2, count: dist.star2, percent: distributionPercentage(dist.star2, total) },
      { stars: 1, count: dist.star1, percent: distributionPercentage(dist.star1, total) },
    ];
  });

  protected readonly hasFilter = computed<boolean>(() => this.rating() !== null);

  constructor() {
    afterNextRender(() => this.inBrowser.set(true));
  }

  setRating(stars: number | null): void {
    this.rating.set(this.rating() === stars ? null : stars);
    this.page.set(1);
  }

  setSort(sort: ReviewSort): void {
    this.sort.set(sort);
    this.page.set(1);
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  reload(): void {
    this.reviewsResource.reload();
  }

  reviewerLabel(reviewer: PublicReviewer): string {
    return formatReviewerLabel(reviewer, this.translation);
  }

  subjectName(review: PublicTutorReview): string {
    return localizedName({ nameTh: review.subjectNameTh, nameEn: review.subjectNameEn }, this.translation.locale());
  }
}
