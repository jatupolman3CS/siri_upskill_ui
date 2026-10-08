import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule, CurrencyPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorHeart, phosphorStar } from '@ng-icons/phosphor-icons/regular';
import { phosphorHeartFill } from '@ng-icons/phosphor-icons/fill';

import { CourseSearchResultItem } from '../../catalog/data/course-api.models';
import { WishlistStore } from '../../catalog/data/wishlist.store';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { CourseFormatBadge } from '../../live/ui/course-format-badge/course-format-badge';
import { CourseNextSession } from '../../live/ui/course-format-badge/course-next-session';

/**
 * Compact course card for the home page's "แนะนำ"/"ใหม่" sections (task P1-23) — a smaller sibling of
 * `CoursesPage`'s own inline card, not the same component: reused twice within `HomePage` alone (two
 * sections, same `CourseSearchResultItem` shape), so factoring it out here avoids duplicating that
 * markup in one file, but it's deliberately NOT shared with `CoursesPage` itself — that file belongs to
 * a different task (P1-21) already verified independently, and merging the two card styles now would
 * risk that file for a two-file win, not a real duplication problem.
 */
@Component({
  selector: 'app-home-course-card',
  imports: [CommonModule, RouterLink, TranslatePipe, CurrencyThbPipe, NgIcon, NgOptimizedImage, CourseFormatBadge, CourseNextSession],
  templateUrl: './home-course-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorStar, phosphorHeart, phosphorHeartFill })],
  host: {
    class: 'block',
  },
})
export class HomeCourseCard {
  protected readonly wishlistStore = inject(WishlistStore);
  readonly course = input.required<CourseSearchResultItem>();
  readonly salePrice = input<number | undefined>(undefined);

  protected readonly isWishlisted = computed(() => {
    const c = this.course();
    return this.wishlistStore.isWishlisted(c.id) || (c.isWishlisted ?? false);
  });

  protected toggleWishlist(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const c = this.course();
    this.wishlistStore.toggleWishlist({
      id: c.id,
      slug: c.slug,
      title: c.title,
      price: c.price,
      thumbnailUrl: c.thumbnailUrl,
      instructorName: c.instructorDisplayName,
    });
  }
}
