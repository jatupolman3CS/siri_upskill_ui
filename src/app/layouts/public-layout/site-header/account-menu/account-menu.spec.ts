import { Component } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { buildTestAccessToken } from '../../../../core/auth/testing/test-jwt';
import { accessTokenStore } from '../../../../core/http/access-token.store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { AccountMenu } from './account-menu';
import { buildAccountMenuItems } from './account-menu-items';

@Component({ selector: 'app-account-menu-test-page', template: '' })
class TestPage {}

describe('buildAccountMenuItems', () => {
  it('lists the account links in order, with the application wizard for people who cannot teach yet', () => {
    const items = buildAccountMenuItems({ canUseInstructorStudio: false, isAdmin: false });

    expect(items.map((item) => item.id)).toEqual([
      'my-courses',
      'my-live-sessions',
      'orders',
      'wishlist',
      'devices',
      'privacy',
      'become-instructor',
    ]);
    expect(items.find((item) => item.id === 'become-instructor')?.route).toBe('/become-instructor');
  });

  it('offers the studio instead of the wizard to instructors, and the admin panel only to admins', () => {
    const instructor = buildAccountMenuItems({ canUseInstructorStudio: true, isAdmin: false });
    expect(instructor.find((item) => item.id === 'instructor')?.route).toBe('/instructor');
    expect(instructor.some((item) => item.id === 'become-instructor')).toBe(false);
    expect(instructor.some((item) => item.id === 'admin')).toBe(false);

    const admin = buildAccountMenuItems({ canUseInstructorStudio: true, isAdmin: true });
    expect(admin.at(-1)).toMatchObject({ id: 'admin', route: '/admin' });
  });

  it('never points a menu entry at a route that does not exist yet (live sessions reuses My courses)', () => {
    const live = buildAccountMenuItems({ canUseInstructorStudio: false, isAdmin: false }).find(
      (item) => item.id === 'my-live-sessions',
    );

    expect(live?.route).toBe('/my-courses');
  });
});

describe('AccountMenu', () => {
  let fixture: ComponentFixture<AccountMenu>;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({
      imports: [AccountMenu],
      providers: [
        provideRouter([{ path: '**', component: TestPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    authService.setAccessToken(buildTestAccessToken({ userId: 'user-menu-1', roles: ['Learner'] }));

    fixture = TestBed.createComponent(AccountMenu);
    fixture.detectChanges();
    TestBed.tick();
    httpMock.expectOne('/api/identity/me').flush({
      id: 'user-menu-1',
      email: 'anna@example.test',
      displayName: 'Anna Lee',
      avatarUrl: null,
      roles: ['Learner'],
    });
    await fixture.whenStable();
    TestBed.tick();
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    accessTokenStore.set(null);
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const trigger = (): HTMLButtonElement => root().querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
  const menu = (): HTMLElement | null => root().querySelector('[role="menu"]');
  const items = (): HTMLElement[] => Array.from(root().querySelectorAll<HTMLElement>('[role="menuitem"]'));

  function open(): void {
    trigger().click();
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  function press(key: string, target: HTMLElement = document.activeElement as HTMLElement): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  it('is closed by default, with the ARIA wiring on the trigger and the avatar as its only content', () => {
    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-label')).toBe('My account menu');
    expect(trigger().textContent?.trim()).toBe('AL');
  });

  it('opens on click: header block with name and email, role=menu items, focus on the first item', () => {
    open();

    expect(menu()).not.toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(menu()?.id);
    expect(root().textContent).toContain('Anna Lee');
    expect(root().textContent).toContain('anna@example.test');
    expect(items().map((item) => item.textContent?.trim())).toEqual([
      'My Courses',
      'My live sessions',
      'Order History',
      'Wishlist',
      'Signed-in devices',
      'Privacy & data (PDPA)',
      'Teach with us',
      'Sign out',
    ]);
    expect(document.activeElement).toBe(items()[0]);
  });

  it('opens with ArrowDown from the trigger and focuses the first item', () => {
    press('ArrowDown', trigger());

    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(items()[0]);
  });

  it('moves focus with ArrowDown/ArrowUp (wrapping) and Home/End', () => {
    open();
    const all = items();

    press('ArrowDown');
    expect(document.activeElement).toBe(all[1]);
    press('ArrowUp');
    expect(document.activeElement).toBe(all[0]);
    press('ArrowUp');
    expect(document.activeElement).toBe(all.at(-1));
    press('ArrowDown');
    expect(document.activeElement).toBe(all[0]);
    press('End');
    expect(document.activeElement).toBe(all.at(-1));
    press('Home');
    expect(document.activeElement).toBe(all[0]);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    open();

    press('Escape');

    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on an outside click', () => {
    open();

    (root().querySelector('[role="presentation"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(menu()).toBeNull();
  });

  it('closes when the user tabs out of the menu', () => {
    open();

    press('Tab');

    expect(menu()).toBeNull();
  });

  it('closes when an item is chosen', () => {
    open();

    items()[2].click();
    fixture.detectChanges();

    expect(menu()).toBeNull();
  });

  it('closes on any route change', async () => {
    open();

    await TestBed.inject(Router).navigateByUrl('/somewhere-else');
    fixture.detectChanges();

    expect(menu()).toBeNull();
  });

  it('offers the admin panel only once the token carries an admin role', () => {
    open();
    expect(items().some((item) => item.textContent?.trim() === 'Admin panel')).toBe(false);

    authService.setAccessToken(buildTestAccessToken({ userId: 'user-menu-1', roles: ['Admin'] }));
    fixture.detectChanges();

    expect(items().map((item) => item.textContent?.trim())).toContain('Admin panel');
    expect(items().map((item) => item.textContent?.trim())).toContain('Instructor Studio');
  });

  it('signs out: clears the session and revokes the cookie on the server', () => {
    open();

    items().find((item) => item.textContent?.trim() === 'Sign out')?.click();
    fixture.detectChanges();

    expect(authService.isAuthenticated()).toBe(false);
    httpMock.expectOne('/api/identity/logout').flush({ message: 'ok' });
    expect(menu()).toBeNull();
  });
});
