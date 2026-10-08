import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { buildTestAccessToken } from '../../core/auth/testing/test-jwt';
import { TranslationService } from '../../core/i18n/translation.service';
import { AdminLayout } from './admin-layout';
import { ADMIN_NAV_LINKS } from './admin-nav';

describe('AdminLayout navigation', () => {
  let fixture: ComponentFixture<AdminLayout>;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [provideRouter([]), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    authService = TestBed.inject(AuthService);
    authService.clearSession();
    authService.setAccessToken(buildTestAccessToken({ userId: 'admin-1', roles: ['Admin'] }));
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.match('/api/identity/me');
    authService.clearSession();
    httpMock.verify();
  });

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function menuButton(): HTMLButtonElement {
    return root().querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
  }

  function openDrawer(): void {
    menuButton().click();
    fixture.detectChanges();
    TestBed.tick();
  }

  it('offers a menu button below md that opens a drawer with every sidebar entry, in the same order', () => {
    expect(menuButton().className).toContain('md:hidden');
    expect(menuButton().getAttribute('aria-label')).toBe('Open menu');

    openDrawer();

    const drawer = Array.from(root().querySelectorAll('[role="dialog"] nav:first-of-type a')).map((a) => a.textContent?.trim());
    const sidebar = Array.from(root().querySelectorAll('aside nav a')).map((a) => a.textContent?.trim());
    expect(drawer).toEqual(sidebar);
    expect(sidebar).toHaveLength(ADMIN_NAV_LINKS.length);
    expect(drawer).toContain('Payments');
    expect(drawer).toContain('Contact messages');
  });

  it('keeps the mode-switch links reachable from the drawer', () => {
    openDrawer();

    const text = (root().querySelector('[role="dialog"]') as HTMLElement).textContent ?? '';
    expect(text).toContain('Instructor mode');
    expect(text).toContain('Learner view');
    expect(text).toContain('Go to home page');
  });

  it('closes on Escape and hands focus back to the menu button', () => {
    const button = menuButton();
    button.focus();
    openDrawer();

    (root().querySelector('[role="dialog"]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    TestBed.tick();

    expect(root().querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
