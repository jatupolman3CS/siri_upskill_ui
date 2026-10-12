import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TranslationService } from '../../core/i18n/translation.service';
import { THEME_COOKIE_NAME, ThemeService } from '../../core/theme/theme.service';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  let fixture: ComponentFixture<ThemeToggle>;
  let theme: ThemeService;

  beforeEach(() => {
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0`;
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    TestBed.configureTestingModule({ imports: [ThemeToggle] });
    TestBed.inject(TranslationService).setLocale('en');
    theme = TestBed.inject(ThemeService);
    fixture = TestBed.createComponent(ThemeToggle);
    fixture.detectChanges();
  });

  afterEach(() => {
    document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0`;
    document.documentElement.removeAttribute('data-theme');
    vi.unstubAllGlobals();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const radios = (): HTMLButtonElement[] => Array.from(root().querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const checked = (): (string | null)[] => radios().map((radio) => radio.getAttribute('aria-checked'));

  it('renders a labelled radio group with light, dark and system options', () => {
    expect(root().querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Colour theme');
    expect(radios().map((radio) => radio.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'Match system']);
  });

  it('starts on "system" with a single tab stop on the checked radio', () => {
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(radios().map((radio) => radio.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });

  it('selects the clicked option, updating the service, the cookie and the checked state', () => {
    radios()[1].click();
    fixture.detectChanges();

    expect(theme.preference()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toContain(`${THEME_COOKIE_NAME}=dark`);
    expect(checked()).toEqual(['false', 'true', 'false']);
    expect(radios().map((radio) => radio.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('moves the selection and focus with arrow keys, wrapping at both ends', () => {
    radios()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(theme.preference()).toBe('light');
    expect(document.activeElement).toBe(radios()[0]);

    radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();

    expect(theme.preference()).toBe('system');
    expect(document.activeElement).toBe(radios()[2]);
  });

  it('uses 44px targets in the comfortable size', () => {
    fixture.componentRef.setInput('size', 'comfortable');
    fixture.detectChanges();

    expect(radios().every((radio) => radio.classList.contains('h-11') && radio.classList.contains('w-11'))).toBe(true);
  });
});
