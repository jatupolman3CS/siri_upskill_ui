import { Component, signal } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { phosphorHouse, phosphorChartBar } from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { StudioMobileNav } from './studio-mobile-nav';
import { StudioNavLink } from './studio-nav-link';

const ITEMS: readonly StudioNavLink[] = [
  { id: 'dashboard', route: '/studio', icon: 'phosphorHouse', labelKey: 'instructor.nav.dashboard', exact: true },
  { id: 'analytics', route: '/studio/analytics', icon: 'phosphorChartBar', labelKey: 'instructor.nav.analytics' },
];

const EXTRA: readonly StudioNavLink[] = [
  { id: 'to-learner', route: '/my-courses', icon: 'phosphorHouse', labelKey: 'instructor.nav.toLearner' },
];

@Component({
  selector: 'app-studio-mobile-nav-test-host',
  imports: [StudioMobileNav],
  providers: [provideIcons({ phosphorHouse, phosphorChartBar })],
  template: `
    <button type="button" id="trigger">outside trigger</button>
    <app-studio-mobile-nav [(open)]="open" titleKey="instructor.nav.menuTitle" [items]="items" [extraItems]="extra()" />
  `,
})
class StudioMobileNavTestHost {
  readonly open = signal(false);
  readonly items = ITEMS;
  readonly extra = signal<readonly StudioNavLink[]>(EXTRA);
}

describe('StudioMobileNav', () => {
  let fixture: ComponentFixture<StudioMobileNavTestHost>;
  let host: StudioMobileNavTestHost;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StudioMobileNavTestHost],
      providers: [
        provideRouter([{ path: '**', component: StudioMobileNavTestHost }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    fixture = TestBed.createComponent(StudioMobileNavTestHost);
    host = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    authService.clearSession();
    TestBed.inject(TranslationService).setLocale('en');
  });

  afterEach(() => {
    authService.clearSession();
    TestBed.inject(HttpTestingController).verify();
  });

  function openDrawer(): void {
    host.open.set(true);
    fixture.detectChanges();
    TestBed.tick();
  }

  function dialogEl(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="dialog"]');
  }

  function linkNamed(text: string): HTMLAnchorElement | undefined {
    return Array.from(fixture.nativeElement.querySelectorAll('nav a')).find(
      (a) => (a as HTMLAnchorElement).textContent?.trim() === text,
    ) as HTMLAnchorElement | undefined;
  }

  it('renders nothing while closed', () => {
    fixture.detectChanges();
    expect(dialogEl()).toBeNull();
  });

  it('renders a modal dialog named by its visible title when open', () => {
    openDrawer();
    const dialog = dialogEl();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent?.trim()).toBe('Instructor Studio menu');
  });

  it('lists every item it was given, plus the header actions it repeats', () => {
    openDrawer();
    expect(linkNamed('Dashboard')).toBeTruthy();
    expect(linkNamed('Analytics')).toBeTruthy();
    expect(linkNamed('Switch to learner view')).toBeTruthy();
  });

  it('omits the repeated-actions section when there are none', () => {
    host.extra.set([]);
    openDrawer();
    expect(linkNamed('Switch to learner view')).toBeUndefined();
    expect(dialogEl()?.textContent).not.toContain('Switch view');
  });

  it('gives touch-sized links and a touch-sized close button (44px)', () => {
    openDrawer();
    const links = Array.from((dialogEl() as HTMLElement).querySelectorAll('nav a'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className).toContain('min-h-11');
    }
    expect((dialogEl()?.querySelector('button') as HTMLButtonElement).className).toContain('h-11 w-11');
  });

  it('closes on Escape and updates the two-way bound open() signal', () => {
    openDrawer();
    (dialogEl() as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.open()).toBe(false);
    expect(dialogEl()).toBeNull();
  });

  it('closes when the backdrop itself is clicked but not when the panel is', () => {
    openDrawer();
    (fixture.nativeElement.querySelector('.studio-mobile-nav-panel') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();
    expect(host.open()).toBe(true);

    (fixture.nativeElement.querySelector('.studio-mobile-nav-overlay') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();
    expect(host.open()).toBe(false);
  });

  it('closes via the close button, which is labelled for assistive tech', () => {
    openDrawer();
    const close = dialogEl()?.querySelector('button') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Close menu');
    close.click();
    fixture.detectChanges();
    expect(host.open()).toBe(false);
  });

  it('closes when a navigation link is followed', () => {
    openDrawer();
    linkNamed('Analytics')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(host.open()).toBe(false);
  });

  it('marks the current page link with aria-current', async () => {
    await TestBed.inject(Router).navigateByUrl('/studio/analytics');
    openDrawer();
    // RouterLinkActive recomputes in a microtask after the links render.
    await fixture.whenStable();
    fixture.detectChanges();
    expect(linkNamed('Analytics')?.getAttribute('aria-current')).toBe('page');
    expect(linkNamed('Dashboard')?.getAttribute('aria-current')).toBeNull();
  });

  it('returns focus to the control that opened it once it closes', () => {
    const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
    fixture.detectChanges();
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    openDrawer();
    host.open.set(false);
    fixture.detectChanges();
    TestBed.tick();

    expect(document.activeElement).toBe(trigger);
  });
});
