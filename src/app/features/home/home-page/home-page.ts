import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorCode,
  phosphorCoins,
  phosphorFolder,
  phosphorGraduationCap,
  phosphorMegaphone,
  phosphorPlayCircle,
} from '@ng-icons/phosphor-icons/regular';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CategoryApiService } from '../../catalog/data/category-api.service';
import { SearchCoursesResponse } from '../../catalog/data/course-api.models';
import { CourseApiService } from '../../catalog/data/course-api.service';
import { resolveCategoryIconName, resolveCategoryTone } from '../../catalog/category-icon';
import { BannerItem } from '../../cms/data/cms-api.models';
import { CmsApiService } from '../../cms/data/cms-api.service';
import { FlashSaleResponse } from '../../commerce/data/commerce-api.models';
import { CommerceApiService } from '../../commerce/data/commerce-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { EnrollmentItemResponse } from '../../learning/data/learning-api.models';
import { LearningApiService } from '../../learning/data/learning-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { FlashSaleBanner } from '../../../shared/flash-sale-banner/flash-sale-banner';
import { HomeCourseCard } from '../home-course-card/home-course-card';

const FEATURED_PAGE_SIZE = 4;

const EMPTY_SEARCH_RESPONSE: SearchCoursesResponse = {
  results: { items: [], totalCount: 0, page: 1, pageSize: FEATURED_PAGE_SIZE, totalPages: 0 },
  facets: { categories: [], levels: [] },
};

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, TranslatePipe, NgIcon, Skeleton, FlashSaleBanner, HomeCourseCard],
  templateUrl: './home-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowRight,
      phosphorCode,
      phosphorCoins,
      phosphorFolder,
      phosphorMegaphone,
      phosphorPlayCircle,
      phosphorGraduationCap,
    }),
  ],
})
export class HomePage {
  private readonly categoryApi = inject(CategoryApiService);
  private readonly courseApi = inject(CourseApiService);
  private readonly commerceApi = inject(CommerceApiService);
  private readonly cmsApi = inject(CmsApiService);
  private readonly learningApi = inject(LearningApiService);
  private readonly seoService = inject(SeoService);
  protected readonly auth = inject(AuthService);
  protected readonly translation = inject(TranslationService);

  protected readonly resolveIconName = resolveCategoryIconName;
  protected readonly resolveTone = resolveCategoryTone;

  protected readonly flashSaleResource = rxResource({
    stream: () =>
      this.commerceApi.getFlashSales().pipe(
        map((res) => {
          const now = Date.now();
          return (
            res.items.find(
              (f) =>
                f.isActive &&
                new Date(f.startsAtUtc).getTime() <= now &&
                new Date(f.endsAtUtc).getTime() > now,
            ) ?? null
          );
        }),
        catchError(() => of(null)),
      ),
    defaultValue: null as FlashSaleResponse | null,
  });

  protected readonly activeFlashSale = computed(() => this.flashSaleResource.value());

  protected readonly flashSalePriceMap = computed(() => {
    const sale = this.activeFlashSale();
    const map = new Map<string, number>();
    if (sale?.items) {
      for (const item of sale.items) {
        map.set(item.courseId, item.salePrice);
      }
    }
    return map;
  });

  protected readonly recentEnrollmentResource = rxResource({
    stream: () => {
      if (!this.auth.isAuthenticated()) return of(null);
      return this.learningApi.getMyEnrollments(1, 1).pipe(
        map((res) => {
          const items = Array.isArray(res) ? res : (res?.items ?? []);
          return items.length > 0 ? items[0] : null;
        }),
        catchError(() => of(null)),
      );
    },
    defaultValue: null as EnrollmentItemResponse | null,
  });

  protected readonly bannersResource = rxResource({
    stream: () => this.cmsApi.getActiveBanners('HomeHero'),
    defaultValue: [] as BannerItem[],
  });

  protected readonly categoriesResource = rxResource({
    stream: () => this.categoryApi.getCategoryTree(),
    defaultValue: [] as readonly CategoryTreeNode[],
  });

  protected readonly recommendedResource = rxResource({
    stream: () => this.courseApi.searchCourses({ sort: 'RatingDesc', page: 1, pageSize: FEATURED_PAGE_SIZE }),
    defaultValue: EMPTY_SEARCH_RESPONSE,
  });

  protected readonly newestResource = rxResource({
    stream: () => this.courseApi.searchCourses({ sort: 'Newest', page: 1, pageSize: FEATURED_PAGE_SIZE }),
    defaultValue: EMPTY_SEARCH_RESPONSE,
  });

  constructor() {
    this.seoService.set({
      title: this.translation.t('common.appName'),
      description: this.translation.t('home.pageDescription'),
      path: '/',
    });
  }

  protected categoryName(node: CategoryTreeNode): string {
    return this.translation.locale() === 'th' ? node.nameTh : node.nameEn;
  }
}
