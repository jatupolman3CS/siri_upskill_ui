import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { buildTestAccessToken } from '../../../core/auth/testing/test-jwt';
import { accessTokenStore } from '../../../core/http/access-token.store';
import { TranslationService } from '../../../core/i18n/translation.service';
import { BottomMobileNav } from './bottom-mobile-nav';

describe('BottomMobileNav', () => {
  let fixture: ComponentFixture<BottomMobileNav>;
  let authService: AuthService;

  beforeEach(() => {
    accessTokenStore.set(null);
    TestBed.configureTestingModule({ imports: [BottomMobileNav], providers: [provideRouter([])] });
    TestBed.inject(TranslationService).setLocale('en');
    authService = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(BottomMobileNav);
  });

  afterEach(() => accessTokenStore.set(null));

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const labels = (): string[] => Array.from(root().querySelectorAll('a')).map((a) => a.textContent?.trim() ?? '');

  it('renders a neutral last slot (neither Sign in nor Orders) until the session restore has finished', () => {
    fixture.detectChanges();

    expect(labels()).toEqual(['Home', 'Courses', 'My Courses']);
    expect(root().querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('offers Sign in to a guest', () => {
    authService.isInitialized.set(true);
    fixture.detectChanges();

    expect(labels()).toEqual(['Home', 'Courses', 'My Courses', 'Log in']);
    expect(root().querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('offers Orders instead of Sign in to a signed-in user', () => {
    authService.isInitialized.set(true);
    authService.setAccessToken(buildTestAccessToken({ userId: 'user-bottom-1' }));
    fixture.detectChanges();

    expect(labels()).toEqual(['Home', 'Courses', 'My Courses', 'Order History']);
    expect(root().querySelector('a[href="/login"]')).toBeNull();
  });
});
