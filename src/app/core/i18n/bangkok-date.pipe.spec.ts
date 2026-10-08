import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BangkokDatePipe } from './bangkok-date.pipe';
import { TranslationService } from './translation.service';

registerLocaleData(localeTh);

describe('BangkokDatePipe', () => {
  let pipe: BangkokDatePipe;
  let translation: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    translation = TestBed.inject(TranslationService);
    pipe = TestBed.runInInjectionContext(() => new BangkokDatePipe());
  });

  it('shows the Bangkok wall-clock time (UTC+7) regardless of the device zone', () => {
    expect(pipe.transform('2026-10-08T03:00:00Z', 'time')).toBe('10:00');
  });

  it('rolls the calendar date forward when UTC+7 crosses midnight', () => {
    translation.setLocale('en');
    expect(pipe.transform('2026-10-08T18:00:00Z', 'date')).toBe('9 Oct 2026');
    expect(pipe.transform('2026-10-08T18:00:00Z', 'time')).toBe('01:00');
  });

  it('formats in the active locale', () => {
    translation.setLocale('en');
    expect(pipe.transform('2026-10-08T03:00:00Z', 'dateTime')).toBe('8 Oct 2026 10:00');
    translation.setLocale('th');
    expect(pipe.transform('2026-10-08T03:00:00Z', 'dateTime')).toContain('ต.ค.');
  });

  it('returns an empty string for empty or unparseable input rather than throwing or returning null', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('not-a-date')).toBe('');
  });

  describe('template reactivity (pure: false)', () => {
    @Component({ template: `{{ '2026-10-08T03:00:00Z' | bangkokDate: 'date' }}`, imports: [BangkokDatePipe] })
    class Host {}

    it('re-renders when the locale toggles without re-navigating', () => {
      const fixture = TestBed.createComponent(Host);
      TestBed.inject(TranslationService).setLocale('en');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.trim()).toBe('8 Oct 2026');

      TestBed.inject(TranslationService).setLocale('th');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.trim()).toContain('ต.ค.');
    });
  });
});
