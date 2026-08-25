import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowRight, phosphorCode, phosphorCoins, phosphorFolder, phosphorMegaphone } from '@ng-icons/phosphor-icons/regular';

import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { CategoryApiService } from '../../catalog/data/category-api.service';
import { SearchCoursesResponse } from '../../catalog/data/course-api.models';
import { CourseApiService } from '../../catalog/data/course-api.service';
import { resolveCategoryIconName } from '../../catalog/category-icon';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { HomeCourseCard } from '../home-course-card/home-course-card';

const FEATURED_PAGE_SIZE = 4;

const EMPTY_SEARCH_RESPONSE: SearchCoursesResponse = {
  results: { items: [], totalCount: 0, page: 1, pageSize: FEATURED_PAGE_SIZE, totalPages: 0 },
  facets: { categories: [], levels: [] },
};

/**
 * Home route — hero (unchanged since P0-33) + real Catalog API data (task P1-23): root categories,
 * top-rated courses ("แนะนำ"), newest courses ("ใหม่"). Section order (hero → category overview →
 * featured courses → CTA) follows `frontend/design-system/siri-upskill/MASTER.md`'s own landing-page
 * pattern.
 * <para>
 * <b>"แนะนำ" (recommended) = `sort: RatingDesc`</b> — the only ranking signal that actually exists on
 * `Course` today without a CMS-curated "featured" flag (out of scope per this task's own acceptance:
 * "data จาก API ยังไม่ต้องต่อ CMS"). Every seeded course currently has `ratingCount = 0` (no reviews
 * exist yet — `CourseStatsUpdater`/P1-08 aren't built), so this sort has no real signal to rank by yet
 * either — same honest situation `CoursesPage`'s own "คะแนนสูงสุด" sort option already ships with. This
 * is a real, correctly-implemented use of an existing sort mode, not a faked "recommended" concept.
 * </para>
 * <para>
 * <b>No social-proof section</b> — `MASTER.md`'s pattern includes one (ratings/testimonials) after
 * featured courses, deliberately skipped here: there is no review data (same reason above) and no CMS
 * testimonial content to pull from. Faking either would be the exact thing `HomePage`'s previous
 * doc comment already refused to do for featured courses before this task existed.
 * </para>
 * <para>
 * <b>Categories section shows root-level nodes only</b> — same depth `CategoryMegaMenu`'s own icon
 * treatment uses; a home-page overview isn't the place to surface subcategories.
 * </para>
 * <para>
 * Every section (categories/recommended/newest) degrades independently and silently: loading shows a
 * skeleton, a fetch error or a genuinely empty result both just omit that section entirely (no error
 * banner) — a failed "featured courses" fetch isn't worth alarming a visitor over on a marketing page
 * whose essential content is the hero + CTA above it. `hasValue()` is checked before every `.value()`
 * read for exactly this reason (a resource's `.value()` throws once `status()` settles into `'error'`,
 * even past its own `defaultValue` — see `CourseDetailPage`'s own doc comment for where this was first
 * discovered and fixed).
 * </para>
 */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, TranslatePipe, NgIcon, Skeleton, HomeCourseCard],
  templateUrl: './home-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowRight, phosphorCode, phosphorCoins, phosphorFolder, phosphorMegaphone })],
})
export class HomePage {
  private readonly categoryApi = inject(CategoryApiService);
  private readonly courseApi = inject(CourseApiService);
  private readonly seoService = inject(SeoService);
  protected readonly translation = inject(TranslationService);

  protected readonly resolveIconName = resolveCategoryIconName;

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
    // Static values (unlike CourseDetailPage's own SEO effect) — title/description don't depend on
    // any fetched data, so one constructor-time call is enough, same as this used to be via the
    // smaller setPageMeta() helper. No jsonLd: task P1-24's acceptance names Course/BreadcrumbList/
    // AggregateRating specifically — none apply to a landing page, so none are invented here.
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
