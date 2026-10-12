import { CommonModule, NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorCalendar,
  phosphorClock,
  phosphorShareNetwork,
  phosphorUser,
} from '@ng-icons/phosphor-icons/regular';

import { CmsApiService } from '../../cms/data/cms-api.service';
import { ReadingMinutesPipe } from '../reading-time.pipe';
import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';

/**
 * `/blog/:slug`. Previously this fabricated a complete fake `PostItem` (fake title, fake HTML body,
 * fake Unsplash cover image) and displayed it whenever `getPublishedPostBySlug` failed — a bad slug
 * (deleted/unpublished post, mistyped link) or a genuine network failure both rendered as if they were
 * a real, published article. That violated frontend.md's "จัดการ loading / error / empty state ให้ครบ"
 * rule outright. Rebuilt on `rxResource` + the same `ApiError.status === 404` "not found vs other error"
 * split `CourseDetailPage` already established (`features/catalog/course-detail-page/course-detail-page.ts`)
 * — a missing/unpublished slug renders a real not-found state, any other failure renders a real error
 * state with retry, and nothing here ever fabricates article content.
 */
@Component({
  selector: 'app-blog-detail-page',
  imports: [CommonModule, RouterLink, NgIcon, NgOptimizedImage, TranslatePipe, ReadingMinutesPipe, EmptyState, Skeleton],
  templateUrl: './blog-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowLeft,
      phosphorCalendar,
      phosphorClock,
      phosphorUser,
      phosphorShareNetwork,
    }),
  ],
})
export class BlogDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly cmsApi = inject(CmsApiService);
  private readonly seoService = inject(SeoService);
  protected readonly translation = inject(TranslationService);
  private readonly toast = inject(ToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly paramMap = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly slug = computed(() => this.paramMap().get('slug') ?? '');

  // No `defaultValue` — same reasoning as `CourseDetailPage.courseResource`: there is no meaningful
  // "empty" `PostItem` to fabricate, so `.value()` is `PostItem | undefined` (undefined while
  // loading/idle, throws only while `status()` is `'error'`). Every template read of `.value()` happens
  // after `isNotFound()`/`hasOtherError()` have already been checked false in the same `@if`/`@else if`
  // chain, so that throw path is never reached.
  protected readonly postResource = rxResource({
    params: () => this.slug(),
    stream: ({ params }) => this.cmsApi.getPublishedPostBySlug(params),
  });

  private readonly resourceError = computed(() => this.postResource.error() as ApiError | undefined);
  protected readonly isNotFound = computed(() => this.resourceError()?.status === 404);
  protected readonly hasOtherError = computed(() => {
    const error = this.resourceError();
    return error !== undefined && error.status !== 404;
  });

  constructor() {
    // Same "always call seoService.set() on every run, including error branches" reasoning as
    // CourseDetailPage's own constructor effect — this component instance is reused across
    // `/blog/postA` → `/blog/postB` (same route, only `:slug` changes), so a branch that skipped
    // `seoService.set()` would leave postA's title/canonical/description on screen while the visible
    // UI already shows postB's not-found/error state.
    effect(() => {
      const appName = this.translation.t('common.appName');
      const path = `/blog/${this.slug()}`;

      if (this.isNotFound()) {
        this.seoService.set({
          title: `${this.translation.t('blog.detail.notFoundHeading')} | ${appName}`,
          description: this.translation.t('blog.detail.notFoundDescription'),
          path,
          robots: 'noindex',
        });
        return;
      }

      if (this.hasOtherError()) {
        this.seoService.set({
          title: `${this.translation.t('blog.detail.errorHeading')} | ${appName}`,
          description: this.translation.t('blog.detail.errorDescription'),
          path,
          robots: 'noindex',
        });
        return;
      }

      const post = this.postResource.value();
      if (!post) {
        return;
      }

      this.seoService.set({
        title: `${post.seoTitle ?? post.title} | ${appName} Blog`,
        description: post.seoDescription ?? post.excerpt ?? '',
        path,
        openGraph: { image: post.coverImageUrl, type: 'article' },
      });
    });
  }

  protected retry(): void {
    this.postResource.reload();
  }

  /**
   * Shares the article's canonical URL: the native share sheet when the browser has one (mostly phones), otherwise the
   * link is copied and a toast confirms it. A dismissed share sheet (`AbortError`) is not an error and stays silent.
   */
  protected async share(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const post = this.postResource.hasValue() ? this.postResource.value() : undefined;
    const url = `${window.location.origin}/blog/${encodeURIComponent(this.slug())}`;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: post?.title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        // Any other share failure falls through to copying the link.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      this.toast.success(this.translation.t('blog.detail.shareCopied'));
    } catch {
      this.toast.error(this.translation.t('blog.detail.shareFailed'));
    }
  }
}
