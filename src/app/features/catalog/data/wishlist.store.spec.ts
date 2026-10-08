import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { buildTestAccessToken } from '../../../core/auth/testing/test-jwt';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { WishlistStore } from './wishlist.store';

function wishlistItem(courseId: string) {
  return {
    courseId,
    slug: courseId,
    title: courseId,
    subtitle: null,
    thumbnailUrl: null,
    price: 100,
    comparePrice: null,
    currency: 'THB',
    instructorName: 'Instructor',
    ratingAverage: 0,
    ratingCount: 0,
    wishlistedAtUtc: '2026-10-01T00:00:00Z',
  };
}

describe('WishlistStore session handling', () => {
  let store: WishlistStore;
  let auth: AuthService;
  let httpMock: HttpTestingController;

  async function settle(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();
  }

  /** The signed-in user's own profile fetch isn't what is under test here — answer it and move on. */
  function answerProfile(): void {
    httpMock.match('/api/identity/me').forEach((req) =>
      req.flush({ id: 'user-w-1', email: 'w@example.test', displayName: 'W', avatarUrl: null, roles: ['Learner'] }),
    );
  }

  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    store = TestBed.inject(WishlistStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    accessTokenStore.set(null);
  });

  it('does not fetch anything for a guest and reports an empty wishlist', async () => {
    await settle();

    httpMock.expectNone('/api/catalog/wishlist');
    expect(store.count()).toBe(0);
  });

  it('loads the wishlist when somebody signs in, even though the store already existed', async () => {
    auth.setAccessToken(buildTestAccessToken({ userId: 'user-w-1' }));
    await settle();
    httpMock.expectOne('/api/catalog/wishlist').flush([wishlistItem('c1'), wishlistItem('c2')]);
    answerProfile();
    await settle();

    expect(store.count()).toBe(2);
    expect(store.isWishlisted('c1')).toBe(true);
  });

  it('drops the wishlist on sign-out so the header badge never shows the previous user\'s count', async () => {
    auth.setAccessToken(buildTestAccessToken({ userId: 'user-w-1' }));
    await settle();
    httpMock.expectOne('/api/catalog/wishlist').flush([wishlistItem('c1')]);
    answerProfile();
    await settle();
    expect(store.count()).toBe(1);

    auth.clearSession();
    await settle();

    expect(store.count()).toBe(0);
    expect(store.isWishlisted('c1')).toBe(false);
  });

  it('adds an optimistic item without inventing an instructor name when the caller has none', async () => {
    auth.setAccessToken(buildTestAccessToken({ userId: 'user-w-1' }));
    await settle();
    httpMock.expectOne('/api/catalog/wishlist').flush([]);
    answerProfile();
    await settle();

    store.toggleWishlist({ id: 'c9' });
    httpMock.expectOne({ method: 'POST', url: '/api/catalog/wishlist/c9' }).flush(null);

    expect(store.isWishlisted('c9')).toBe(true);
    expect(store.items()[0].instructorName).toBeNull();
  });
});
