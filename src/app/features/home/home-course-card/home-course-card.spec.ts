import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TranslationService } from '../../../core/i18n/translation.service';
import { CourseSearchResultItem } from '../../catalog/data/course-api.models';
import { WishlistStore } from '../../catalog/data/wishlist.store';
import { HomeCourseCard } from './home-course-card';

const COURSE: CourseSearchResultItem = {
  id: 'course-1',
  slug: 'angular-masterclass',
  title: 'Angular Masterclass',
  subtitle: null,
  thumbnailUrl: null,
  price: 1990,
  comparePrice: null,
  currency: 'THB',
  level: 'Beginner',
  language: 'Thai',
  ratingAverage: 4.5,
  ratingCount: 10,
  enrollmentCount: 100,
  episodeCount: 12,
  totalDurationSeconds: 3600,
  instructorId: 'instructor-1',
  instructorDisplayName: 'Somchai',
  categoryId: 'cat-1',
} as CourseSearchResultItem;

describe('HomeCourseCard', () => {
  let fixture: ComponentFixture<HomeCourseCard>;
  let root: HTMLElement;
  const toggleWishlist = vi.fn();

  beforeEach(() => {
    toggleWishlist.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WishlistStore, useValue: { isWishlisted: () => false, toggleWishlist } },
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    fixture = TestBed.createComponent(HomeCourseCard);
    fixture.componentRef.setInput('course', COURSE);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  it('never nests the wishlist button inside a link', () => {
    const button = root.querySelector('button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.closest('a')).toBeNull();
    expect(root.querySelector('a button, button a')).toBeNull();
  });

  it('keeps the whole card clickable through the title link and orders it before the wishlist button', () => {
    const link = root.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/courses/angular-masterclass');
    expect(link.textContent?.trim()).toBe('Angular Masterclass');

    const interactive = Array.from(root.querySelectorAll('a, button'));
    expect(interactive.map((el) => el.tagName)).toEqual(['A', 'BUTTON']);
  });

  it('toggles the wishlist from the button without navigating', () => {
    const button = root.querySelector('button') as HTMLButtonElement;
    button.click();
    expect(toggleWishlist).toHaveBeenCalledOnce();
  });
});
