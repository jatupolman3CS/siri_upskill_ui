import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorArticle,
  phosphorCalendar,
  phosphorClock,
  phosphorUser,
} from '@ng-icons/phosphor-icons/regular';

import { CmsApiService } from '../../cms/data/cms-api.service';
import { ReadingMinutesPipe } from '../reading-time.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';

/**
 * `/blog`. Previously seeded `posts` with 3 hardcoded fake post entries as its literal default value,
 * and its `getPublishedPosts()` error handler was a no-op that just kept those fake defaults on screen
 * forever on failure — indistinguishable from real content, with an empty API response (0 real posts)
 * or a failed fetch producing the exact same fake-article grid. Rebuilt on `rxResource` following
 * `CoursesPage`'s established loading/error/empty pattern (`features/catalog/courses-page/courses-page.ts`):
 * a skeleton grid while loading, a real error state with retry on failure, a real empty state when the
 * API genuinely returns zero posts, and the real list otherwise — never fabricated content.
 */
@Component({
  selector: 'app-blog-list-page',
  imports: [CommonModule, RouterLink, NgIcon, NgOptimizedImage, TranslatePipe, ReadingMinutesPipe, EmptyState, Skeleton],
  templateUrl: './blog-list-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArticle,
      phosphorCalendar,
      phosphorUser,
      phosphorClock,
      phosphorArrowRight,
    }),
  ],
})
export class BlogListPage implements OnInit {
  private readonly cmsApi = inject(CmsApiService);
  private readonly seoService = inject(SeoService);

  protected readonly postsResource = rxResource({
    stream: () => this.cmsApi.getPublishedPosts(),
  });

  protected readonly isLoadingPosts = computed(() => this.postsResource.isLoading() && !this.postsResource.hasValue());
  protected readonly hasError = computed(() => this.postsResource.error() !== undefined);
  protected readonly posts = computed(() => (this.postsResource.hasValue() ? this.postsResource.value().items : []));

  protected readonly skeletonCards = Array.from({ length: 6 }, (_, i) => i);

  ngOnInit(): void {
    this.seoService.set({
      title: 'บทความ & ข่าวสาร | SIRI UpSkill Blog',
      description: 'รวมบทความ เทคนิค และข่าวสารความรู้ด้านเทคโนโลยีจากทีมงาน SIRI UpSkill',
      path: '/blog',
    });
  }

  protected retry(): void {
    this.postsResource.reload();
  }
}
