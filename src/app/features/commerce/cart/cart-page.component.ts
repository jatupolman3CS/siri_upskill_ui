import { CommonModule, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorCheckCircle,
  phosphorLockSimple,
  phosphorShieldCheck,
  phosphorShoppingBag,
  phosphorTicket,
  phosphorTrash,
  phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../../core/auth/auth.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';
import { CommerceApiService } from '../data/commerce-api.service';
import { CartStore } from './cart-store.service';

@Component({
  selector: 'app-cart-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NgIcon,
    NgOptimizedImage,
    CurrencyThbPipe,
    TranslatePipe,
    Spinner,
  ],
  templateUrl: './cart-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorShoppingBag,
      phosphorTrash,
      phosphorTicket,
      phosphorShieldCheck,
      phosphorLockSimple,
      phosphorArrowRight,
      phosphorCheckCircle,
      phosphorWarningCircle,
    }),
  ],
})
export class CartPageComponent implements OnInit {
  protected readonly cart = inject(CartStore);
  private readonly commerceApi = inject(CommerceApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly seoService = inject(SeoService);
  private readonly translation = inject(TranslationService);

  protected promoCodeInput = '';
  protected readonly isCreatingOrder = signal(false);
  protected readonly checkoutError = signal<string | null>(null);

  ngOnInit(): void {
    this.seoService.set({
      title: this.translation.t('cart.pageTitle'),
      description: this.translation.t('cart.pageDescription'),
      path: '/cart',
      robots: 'noindex',
    });
  }

  protected applyPromo(): void {
    if (!this.promoCodeInput.trim()) return;
    this.cart.applyPromoCode(this.promoCodeInput).subscribe({
      next: (res) => {
        if (res.isValid) {
          this.promoCodeInput = '';
        }
      },
      // CartStore.applyPromoCode() already updates `promoError`/`isApplyingPromo` itself (its
      // internal `tap`) — this handler exists only so RxJS doesn't treat a failed request as an
      // unhandled observable error (it rethrows asynchronously otherwise).
      error: () => undefined,
    });
  }

  protected removePromo(): void {
    this.cart.removePromoCode();
  }

  protected proceedToCheckout(): void {
    if (!this.cart.hasItems() || this.isCreatingOrder()) return;

    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/cart' },
      });
      return;
    }

    this.isCreatingOrder.set(true);
    this.checkoutError.set(null);

    const items = this.cart.items();
    const appliedPromo = this.cart.appliedPromo();

    this.commerceApi
      .createOrder({
        courseIds: items.map((i) => i.courseId),
        promoCode: appliedPromo?.code,
      })
      .subscribe({
        next: (order) => {
          this.isCreatingOrder.set(false);
          this.cart.clearCart();
          this.router.navigate([order.status === 'Paid' ? '/checkout/success' : '/checkout', order.id]);
        },
        error: (err) => {
          this.isCreatingOrder.set(false);
          this.checkoutError.set(
            err?.message
              ? this.translation.t(err.message)
              : this.translation.t('cart.checkoutFailed')
          );
        },
      });
  }
}
