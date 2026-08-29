import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { CommerceApiService } from '../data/commerce-api.service';
import { PromoCodeValidationResponse } from '../data/commerce-api.models';

export interface CartItem {
  readonly courseId: string;
  readonly title: string;
  readonly slug: string;
  readonly price: number;
  readonly thumbnailUrl?: string | null;
  readonly instructorName?: string;
}

const STORAGE_KEY = 'siri_cart_items_v1';

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly commerceApi = inject(CommerceApiService);

  readonly items = signal<readonly CartItem[]>(this.loadFromStorage());
  readonly appliedPromo = signal<PromoCodeValidationResponse | null>(null);
  readonly promoError = signal<string | null>(null);
  readonly isApplyingPromo = signal<boolean>(false);

  readonly itemCount = computed(() => this.items().length);
  readonly hasItems = computed(() => this.items().length > 0);

  readonly subtotal = computed(() =>
    this.items().reduce((sum, item) => sum + item.price, 0)
  );

  readonly discount = computed(() => {
    const promo = this.appliedPromo();
    if (!promo || !promo.isValid) return 0;
    return promo.discountAmount;
  });

  readonly total = computed(() =>
    Math.max(0, this.subtotal() - this.discount())
  );

  addItem(item: CartItem): boolean {
    const current = this.items();
    if (current.some((i) => i.courseId === item.courseId)) {
      return false; // Already in cart
    }
    const updated = [...current, item];
    this.items.set(updated);
    this.saveToStorage(updated);
    return true;
  }

  removeItem(courseId: string): void {
    const updated = this.items().filter((i) => i.courseId !== courseId);
    this.items.set(updated);
    this.saveToStorage(updated);
    if (this.appliedPromo()) {
      this.revalidatePromo();
    }
  }

  clearCart(): void {
    this.items.set([]);
    this.appliedPromo.set(null);
    this.promoError.set(null);
    this.saveToStorage([]);
  }

  applyPromoCode(code: string): Observable<PromoCodeValidationResponse> {
    this.isApplyingPromo.set(true);
    this.promoError.set(null);

    return this.commerceApi
      .validatePromoCode({
        code: code.trim().toUpperCase(),
        courseIds: this.items().map((i) => i.courseId),
      })
      .pipe(
        tap({
          next: (res) => {
            this.isApplyingPromo.set(false);
            if (res.isValid) {
              this.appliedPromo.set(res);
              this.promoError.set(null);
            } else {
              this.appliedPromo.set(null);
              this.promoError.set(res.errorMessage || 'รหัสส่วนลดไม่ถูกต้องหรือไม่สามารถใช้ได้');
            }
          },
          error: (err) => {
            this.isApplyingPromo.set(false);
            this.appliedPromo.set(null);
            this.promoError.set(err?.message || 'เกิดข้อผิดพลาดในการตรวจสอบรหัสส่วนลด');
          },
        })
      );
  }

  removePromoCode(): void {
    this.appliedPromo.set(null);
    this.promoError.set(null);
  }

  private revalidatePromo(): void {
    const promo = this.appliedPromo();
    if (!promo) return;
    if (this.items().length === 0) {
      this.appliedPromo.set(null);
      return;
    }
    this.applyPromoCode(promo.code).subscribe();
  }

  private loadFromStorage(): readonly CartItem[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const json = localStorage.getItem(STORAGE_KEY);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(items: readonly CartItem[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }
    } catch {
      // Ignore storage errors
    }
  }
}
