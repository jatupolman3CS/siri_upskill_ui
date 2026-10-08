import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../core/i18n/translation.service';
import { LanguageMenu } from './language-menu';

describe('LanguageMenu', () => {
  let fixture: ComponentFixture<LanguageMenu>;
  let translation: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LanguageMenu] });
    translation = TestBed.inject(TranslationService);
    translation.setLocale('th');
    fixture = TestBed.createComponent(LanguageMenu);
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const trigger = (): HTMLButtonElement => root().querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
  const options = (): HTMLElement[] => Array.from(root().querySelectorAll<HTMLElement>('[role="menuitemradio"]'));

  function open(): void {
    trigger().click();
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  it('shows the active language code on the trigger and starts closed', () => {
    expect(trigger().textContent).toContain('TH');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(root().querySelector('[role="menu"]')).toBeNull();
  });

  it('lists both languages as radio items and marks the active one', () => {
    open();

    expect(options().map((option) => option.textContent?.trim())).toEqual(['ไทย', 'English']);
    expect(options().map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(document.activeElement).toBe(options()[0]);
  });

  it('switches language, closes, and returns focus to the trigger', () => {
    open();

    options()[1].click();
    fixture.detectChanges();

    expect(translation.locale()).toBe('en');
    expect(trigger().textContent).toContain('EN');
    expect(root().querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on Escape (focus back on the trigger) and on an outside click', () => {
    open();
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());

    open();
    (root().querySelector('[role="presentation"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(root().querySelector('[role="menu"]')).toBeNull();
  });

  it('roves with the arrow keys', () => {
    open();

    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(document.activeElement).toBe(options()[1]);
  });
});
