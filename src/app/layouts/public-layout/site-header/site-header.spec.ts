import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { buildTestAccessToken } from '../../../core/auth/testing/test-jwt';
import { TranslationService } from '../../../core/i18n/translation.service';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { SiteHeader } from './site-header';

describe('SiteHeader', () => {
  let fixture: ComponentFixture<SiteHeader>;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [
        provideRouter([]),
        // withFetch() — matches app.config.ts's real HTTP client setup, not just provideHttpClient()'s
        // plain XHR default (see CourseDetailPage's own spec for why this isn't just cosmetic).
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    fixture = TestBed.createComponent(SiteHeader);
    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    // English locale purely for stable ASCII text lookups below.
    TestBed.inject(TranslationService).setLocale('en');
  });

  afterEach(() => {
    httpMock.verify();
    accessTokenStore.set(null);
  });

  /** Marks the session restore as finished (what the app initializer does before the browser renders). */
  function resolveSession(): void {
    authService.isInitialized.set(true);
  }

  async function signIn(roles: readonly string[] = ['Learner']): Promise<void> {
    authService.setAccessToken(buildTestAccessToken({ userId: 'user-header-1', roles }));
  }

  /** Renders, then answers every request the header fires on its own (categories, /me, wishlist,
   *  notifications) so `httpMock.verify()` stays meaningful. */
  async function render(options: { categories?: readonly unknown[]; me?: object | 'fail' } = {}): Promise<void> {
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne('/api/catalog/categories').flush(options.categories ?? []);
    for (const req of httpMock.match('/api/identity/me')) {
      if (options.me === 'fail') {
        req.flush({ title: 'Not Found' }, { status: 404, statusText: 'Not Found' });
      } else {
        req.flush(
          options.me ?? {
            id: 'user-header-1',
            email: 'somchai@example.test',
            displayName: 'Somchai Jaidee',
            avatarUrl: null,
            roles: ['Learner'],
          },
        );
      }
    }
    httpMock.match('/api/catalog/wishlist').forEach((req) => req.flush([]));
    httpMock.match('/api/notifications/my').forEach((req) => req.flush([]));
    await fixture.whenStable();
    TestBed.tick();
    fixture.detectChanges();
  }

  /** Same as `render` but failing the categories fetch. */
  async function renderWithFailedCategories(): Promise<void> {
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne('/api/catalog/categories').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function linkNamed(text: string, scope: ParentNode = root()): HTMLAnchorElement | undefined {
    return Array.from(scope.querySelectorAll('a')).find((a) => a.textContent?.trim() === text);
  }

  function accountTrigger(): HTMLButtonElement | null {
    return root().querySelector('app-account-menu button[aria-haspopup="menu"]');
  }

  describe('before the session restore has finished (SSR / first paint)', () => {
    it('shows a neutral placeholder: no Log in / Sign up, and no avatar either', async () => {
      await render();

      expect(root().querySelector('[data-testid="auth-placeholder"]')).not.toBeNull();
      expect(linkNamed('Log in')).toBeUndefined();
      expect(linkNamed('Sign up')).toBeUndefined();
      expect(accountTrigger()).toBeNull();
    });
  });

  describe('as a guest', () => {
    beforeEach(() => resolveSession());

    it('shows Log in and Sign up, and no account menu', async () => {
      await render();

      expect(root().querySelector('[data-testid="auth-placeholder"]')).toBeNull();
      expect(linkNamed('Log in')?.getAttribute('href')).toBe('/login');
      expect(linkNamed('Sign up')?.getAttribute('href')).toBe('/register');
      expect(accountTrigger()).toBeNull();
    });

    it('sends the instructor CTA to the application wizard', async () => {
      await render();

      expect(linkNamed('Teach with us')?.getAttribute('href')).toBe('/become-instructor');
    });

    it('does not show the notification bell', async () => {
      await render();

      expect(root().querySelector('app-notification-bell')).toBeNull();
    });
  });

  describe('when signed in', () => {
    beforeEach(() => {
      resolveSession();
    });

    it('shows the avatar menu and never Log in / Sign up', async () => {
      await signIn();
      await render();

      expect(accountTrigger()).not.toBeNull();
      expect(linkNamed('Log in')).toBeUndefined();
      expect(linkNamed('Sign up')).toBeUndefined();
      expect(root().querySelector('app-notification-bell')).not.toBeNull();
    });

    it('shows the studio CTA to an instructor', async () => {
      await signIn(['Instructor']);
      await render();
      expect(linkNamed('Instructor Studio')?.getAttribute('href')).toBe('/instructor');
    });

    it('opens the account menu with the profile and sign-out clears the session', async () => {
      await signIn();
      await render();

      accountTrigger()?.click();
      fixture.detectChanges();
      TestBed.tick();

      const menu = root().querySelector('[role="menu"]') as HTMLElement;
      expect(menu).not.toBeNull();
      expect(root().textContent).toContain('Somchai Jaidee');
      expect(root().textContent).toContain('somchai@example.test');
      expect(linkNamed('Signed-in devices', menu)).toBeTruthy();

      (Array.from(menu.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Sign out') as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.match('/api/identity/logout').forEach((req) => req.flush({ message: 'ok' }));

      expect(authService.isAuthenticated()).toBe(false);
    });

    it('still renders a usable avatar menu when the /me fetch fails (falls back to a generic label)', async () => {
      await signIn();
      await render({ me: 'fail' });

      accountTrigger()?.click();
      fixture.detectChanges();

      expect(accountTrigger()).not.toBeNull();
      expect(root().textContent).toContain('My account');
    });
  });

  it('opens the mobile nav drawer from the hamburger trigger, with aria-expanded reflecting state', async () => {
    resolveSession();
    await render();
    const trigger = root().querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(root().querySelector('[role="dialog"]')).toBeNull();

    trigger.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(root().querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('fetches the category tree once and passes it through to the desktop mega menu', async () => {
    await render({
      categories: [
        {
          id: 'cat-1',
          slug: 'finance-investment',
          nameTh: 'การเงินและการลงทุน',
          nameEn: 'Finance & Investment',
          iconKey: 'coins',
          sortOrder: 0,
          isActive: true,
          children: [],
        },
      ],
    });

    const megaMenuTrigger = root().querySelector('app-category-mega-menu button') as HTMLButtonElement;
    megaMenuTrigger.click();
    fixture.detectChanges();

    expect(root().querySelector('#app-category-mega-menu-panel')?.textContent).toContain('Finance & Investment');
  });

  it('links the primary nav (Home, Courses, Live, Blog, Learning paths) — Live opens the catalog filtered to live courses', async () => {
    await render();
    const nav = root().querySelector('nav') as HTMLElement;

    expect(linkNamed('Home', nav)?.getAttribute('href')).toBe('/');
    expect(linkNamed('Courses', nav)?.getAttribute('href')).toBe('/courses');
    expect(linkNamed('Blog', nav)?.getAttribute('href')).toBe('/blog');
    expect(linkNamed('Learning Paths', nav)?.getAttribute('href')).toBe('/learning-paths');
    expect(linkNamed('Live', nav)?.getAttribute('href')).toBe('/courses?format=Live');
  });

  it('still renders the header, wordmark, and nav when the category tree fetch fails, instead of crashing', async () => {
    resolveSession();
    await renderWithFailedCategories();

    expect(root().querySelector('a[href="/"]')?.textContent?.trim()).toBeTruthy();
    expect(linkNamed('Log in')).toBeTruthy();
    expect(root().querySelector('app-category-mega-menu')).not.toBeNull();
  });
});
