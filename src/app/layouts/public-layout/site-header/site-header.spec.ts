import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SiteHeader } from './site-header';

describe('SiteHeader', () => {
  let fixture: ComponentFixture<SiteHeader>;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
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
    // accessTokenStore is a module-level singleton signal, not reset by TestBed — clear it so a
    // previous spec file's logged-in state never leaks into this one (see mobile-nav.spec.ts for the
    // same note).
    authService.clearSession();
    // English locale purely for stable ASCII text lookups below, same reasoning as
    // devices-page.spec.ts — Thai (the default) behaves identically, this is test-readability only.
    TestBed.inject(TranslationService).setLocale('en');
  });

  afterEach(() => {
    authService.clearSession();
    httpMock.verify();
  });

  /** `SiteHeader`'s `categoriesResource` (P1-20) fires this on its first change detection — every test
   *  needs to detect changes and flush it once before asserting anything, or `httpMock.verify()` fails
   *  the test on an unflushed request. */
  async function detectChangesAndFlushCategories(categories: readonly unknown[] = []): Promise<void> {
    fixture.detectChanges();
    httpMock.expectOne('/api/catalog/categories').flush(categories);
    if (authService.isAuthenticated()) {
      httpMock.match('/api/notifications/my').forEach((req) => req.flush([]));
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Regression coverage for the crash reported against a real backend outage: `categoriesResource`
   *  only has a `defaultValue`, which does NOT make `.value()` safe to read once the resource has
   *  genuinely settled into an error state (throws there regardless — see `CourseDetailPage`'s own doc
   *  comment for where this was first discovered). Before `categories()`'s `hasValue()` guard existed,
   *  this exact sequence threw out of `detectChanges()` (a `ResourceValueError`), because both
   *  `CategoryMegaMenu` and `MobileNav` read `categoriesResource.value()` directly in the template. */
  async function detectChangesAndFailCategories(): Promise<void> {
    fixture.detectChanges();
    httpMock.expectOne('/api/catalog/categories').flush({ title: 'Server Error' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function linkNamed(text: string): HTMLAnchorElement | undefined {
    return Array.from(fixture.nativeElement.querySelectorAll('a')).find(
      (a) => (a as HTMLAnchorElement).textContent?.trim() === text,
    ) as HTMLAnchorElement | undefined;
  }

  function buttonNamed(text: string): HTMLButtonElement | undefined {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === text,
    ) as HTMLButtonElement | undefined;
  }

  it('shows Log in/Sign up when logged out, not the devices link or sign-out', async () => {
    await detectChangesAndFlushCategories();
    expect(linkNamed('Log in')).toBeTruthy();
    expect(linkNamed('Sign up')).toBeTruthy();
    expect(linkNamed('Signed-in devices')).toBeFalsy();
    expect(buttonNamed('Sign out')).toBeFalsy();
  });

  it('shows the devices link and sign-out when logged in, and sign-out clears the session', async () => {
    authService.setAccessToken('fake-token');
    await detectChangesAndFlushCategories();

    expect(linkNamed('Signed-in devices')).toBeTruthy();
    expect(linkNamed('Log in')).toBeFalsy();

    buttonNamed('Sign out')?.click();
    fixture.detectChanges();
    httpMock.match('/api/identity/logout').forEach((req) => req.flush({ message: 'ok' }));

    expect(authService.isAuthenticated()).toBe(false);
  });

  it('opens the mobile nav drawer from the hamburger trigger, with aria-expanded reflecting state', async () => {
    await detectChangesAndFlushCategories();
    const trigger = fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();

    trigger.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('fetches the category tree once and passes it through to the desktop mega menu', async () => {
    await detectChangesAndFlushCategories([
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
    ]);

    const megaMenuTrigger = fixture.nativeElement.querySelector('app-category-mega-menu button') as HTMLButtonElement;
    megaMenuTrigger.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#app-category-mega-menu-panel')?.textContent).toContain(
      'Finance & Investment',
    );
  });

  it('still renders the header, wordmark, and nav when the category tree fetch fails, instead of crashing', async () => {
    await detectChangesAndFailCategories();

    expect(fixture.nativeElement.querySelector('a[href="/"]')?.textContent.trim()).toBeTruthy();
    expect(linkNamed('Log in')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-category-mega-menu')).not.toBeNull();
  });
});
