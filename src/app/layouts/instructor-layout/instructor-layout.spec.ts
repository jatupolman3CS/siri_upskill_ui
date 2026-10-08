import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { buildTestAccessToken } from '../../core/auth/testing/test-jwt';
import { TranslationService } from '../../core/i18n/translation.service';
import { InstructorLayout } from './instructor-layout';
import { INSTRUCTOR_NAV_LINKS } from './instructor-nav';

describe('InstructorLayout navigation', () => {
  let fixture: ComponentFixture<InstructorLayout>;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [InstructorLayout],
      providers: [provideRouter([]), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    authService = TestBed.inject(AuthService);
    authService.clearSession();
    authService.setAccessToken(buildTestAccessToken({ userId: 'user-1', roles: ['Instructor'] }));
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InstructorLayout);
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

  function drawerLinks(): string[] {
    return Array.from(root().querySelectorAll('[role="dialog"] nav:first-of-type a')).map((a) => a.textContent?.trim() ?? '');
  }

  function sidebarLinks(): string[] {
    return Array.from(root().querySelectorAll('aside nav a')).map((a) => a.textContent?.trim() ?? '');
  }

  it('offers a menu button that is only visible below md and has an accessible name', () => {
    const button = menuButton();
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Open menu');
    expect(button.className).toContain('md:hidden');
    expect(button.className).toContain('h-11 w-11');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('reaches every sidebar entry from the drawer, including Live sessions and Google connection', () => {
    expect(root().querySelector('[role="dialog"]')).toBeNull();
    openDrawer();

    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    const drawer = drawerLinks();
    expect(drawer).toContain('Live sessions');
    expect(drawer).toContain('Google connection');
    // One source of truth: the drawer lists exactly what the sidebar lists, in the same order.
    expect(drawer).toEqual(sidebarLinks());
    expect(sidebarLinks()).toHaveLength(INSTRUCTOR_NAV_LINKS.length);
  });

  it('keeps the header actions reachable from the drawer, admin mode only for admins', () => {
    openDrawer();

    const dialogText = (root().querySelector('[role="dialog"]') as HTMLElement).textContent ?? '';
    expect(dialogText).toContain('Switch to learner view');
    expect(dialogText).toContain('Create a new course');
    expect(dialogText).not.toContain('Admin mode');
  });

  it('adds the admin-mode link to the drawer for an admin', () => {
    authService.setAccessToken(buildTestAccessToken({ userId: 'user-1', roles: ['Instructor', 'Admin'] }));
    fixture.detectChanges();
    openDrawer();

    expect((root().querySelector('[role="dialog"]') as HTMLElement).textContent).toContain('Admin mode');
  });

  it('closes on Escape and hands focus back to the menu button', () => {
    const button = menuButton();
    button.focus();
    openDrawer();
    expect(root().querySelector('[role="dialog"]')).not.toBeNull();

    (root().querySelector('[role="dialog"]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    TestBed.tick();

    expect(root().querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
