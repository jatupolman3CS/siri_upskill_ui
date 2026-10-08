import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorHeart,
  phosphorShoppingCart,
  phosphorStar,
  phosphorTrash,
} from '@ng-icons/phosphor-icons/regular';
import { phosphorHeartFill, phosphorStarFill } from '@ng-icons/phosphor-icons/fill';
import { CartStore } from '../../commerce/cart/cart-store.service';
import { WishlistCourseItemResponse } from '../data/course-api.models';
import { WishlistStore } from '../data/wishlist.store';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';

@Component({
  selector: 'app-wishlist-page',
  imports: [CommonModule, RouterLink, NgIcon, CurrencyThbPipe, TranslatePipe, Skeleton],
  templateUrl: './wishlist-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorHeart,
      phosphorHeartFill,
      phosphorShoppingCart,
      phosphorTrash,
      phosphorStar,
      phosphorStarFill,
      phosphorArrowRight,
    }),
  ],
})
export class WishlistPage implements OnInit {
  private readonly seoService = inject(SeoService);
  protected readonly wishlistStore = inject(WishlistStore);
  protected readonly cartStore = inject(CartStore);

  ngOnInit(): void {
    this.seoService.set({
      title: 'สิ่งที่อยากได้ | SIRI UpSkill',
      description: 'รวมรายการคอร์สเรียนที่คุณบันทึกไว้ในสิ่งที่อยากได้',
      path: '/wishlist',
      robots: 'noindex',
    });

    this.wishlistStore.loadWishlist();
  }

  protected addToCart(item: WishlistCourseItemResponse): void {
    this.cartStore.addItem({
      courseId: item.courseId,
      slug: item.slug,
      title: item.title,
      price: item.price,
      thumbnailUrl: item.thumbnailUrl,
      instructorName: item.instructorName ?? undefined,
    });
  }

  protected removeItem(item: WishlistCourseItemResponse): void {
    this.wishlistStore.toggleWishlist({ id: item.courseId });
  }
}
