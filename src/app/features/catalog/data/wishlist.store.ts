import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { WishlistCourseItemResponse } from './course-api.models';
import { CourseApiService } from './course-api.service';

@Injectable({ providedIn: 'root' })
export class WishlistStore {
  private readonly courseApi = inject(CourseApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly _items = signal<WishlistCourseItemResponse[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _wishlistIds = signal<Set<string>>(new Set());

  public readonly items = this._items.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();
  public readonly count = computed(() => this._items().length);

  constructor() {
    if (this.auth.isAuthenticated()) {
      this.loadWishlist();
    }
  }

  loadWishlist(): void {
    if (!this.auth.isAuthenticated()) {
      this._items.set([]);
      this._wishlistIds.set(new Set());
      return;
    }

    this._isLoading.set(true);
    this.courseApi
      .getWishlist()
      .pipe(
        catchError(() => of([])),
      )
      .subscribe((items) => {
        const list = Array.isArray(items) ? items : ((items as { items?: typeof items })?.items ?? []);
        this._items.set(list);
        this._wishlistIds.set(new Set(list.map((i) => i.courseId)));
        this._isLoading.set(false);
      });
  }

  isWishlisted(courseId: string): boolean {
    return this._wishlistIds().has(courseId);
  }

  syncWishlistStatus(courseId: string, isWishlisted: boolean): void {
    const current = this._wishlistIds();
    if (current.has(courseId) === isWishlisted) return;
    const updated = new Set(current);
    if (isWishlisted) {
      updated.add(courseId);
    } else {
      updated.delete(courseId);
    }
    this._wishlistIds.set(updated);
  }

  toggleWishlist(course: { id: string; slug?: string; title?: string; price?: number; thumbnailUrl?: string | null; instructorName?: string }): void {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    const courseId = course.id;
    const isCurrentlyWishlisted = this.isWishlisted(courseId);

    if (isCurrentlyWishlisted) {
      // Optimistic remove
      const updatedSet = new Set(this._wishlistIds());
      updatedSet.delete(courseId);
      this._wishlistIds.set(updatedSet);
      this._items.set(this._items().filter((i) => i.courseId !== courseId));

      this.courseApi.removeFromWishlist(courseId).subscribe({
        error: () => {
          this.loadWishlist();
        },
      });
    } else {
      // Optimistic add
      const updatedSet = new Set(this._wishlistIds());
      updatedSet.add(courseId);
      this._wishlistIds.set(updatedSet);

      const optimisticItem: WishlistCourseItemResponse = {
        courseId,
        slug: course.slug || courseId,
        title: course.title || '',
        subtitle: null,
        thumbnailUrl: course.thumbnailUrl ?? null,
        price: course.price ?? 0,
        comparePrice: null,
        currency: 'THB',
        instructorName: course.instructorName || 'ผู้สอน',
        ratingAverage: 0,
        ratingCount: 0,
        wishlistedAtUtc: new Date().toISOString(),
      };
      this._items.set([optimisticItem, ...this._items()]);

      this.courseApi.addToWishlist(courseId).subscribe({
        error: () => {
          this.loadWishlist();
        },
      });
    }
  }
}
