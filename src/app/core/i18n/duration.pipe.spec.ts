import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from './translation.service';
import { DurationPipe } from './duration.pipe';

describe('DurationPipe', () => {
  let pipe: DurationPipe;
  let translation: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    pipe = TestBed.runInInjectionContext(() => new DurationPipe());
    translation = TestBed.inject(TranslationService);
  });

  it('returns null for null/undefined/negative input', () => {
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
    expect(pipe.transform(-1)).toBeNull();
  });

  describe('long format (default)', () => {
    it('formats under an hour as minutes only, in Thai', () => {
      translation.setLocale('th');
      expect(pipe.transform(1800)).toBe('30 นาที');
    });

    it('formats under an hour as minutes only, in English', () => {
      translation.setLocale('en');
      expect(pipe.transform(1800)).toBe('30m');
    });

    it('formats an hour or more as hours + minutes, in Thai', () => {
      translation.setLocale('th');
      expect(pipe.transform(9000)).toBe('2 ชม. 30 นาที');
    });

    it('formats an hour or more as hours + minutes, in English', () => {
      translation.setLocale('en');
      expect(pipe.transform(9000)).toBe('2h 30m');
    });

    it('formats exactly zero seconds as zero minutes', () => {
      translation.setLocale('en');
      expect(pipe.transform(0)).toBe('0m');
    });

    it('formats a whole number of hours without dropping the zero-minutes remainder', () => {
      translation.setLocale('en');
      expect(pipe.transform(7200)).toBe('2h 0m');
    });
  });

  describe('compact format', () => {
    it('formats under an hour as M:SS', () => {
      expect(pipe.transform(125, 'compact')).toBe('2:05');
    });

    it('formats an hour or more as H:MM:SS', () => {
      expect(pipe.transform(3725, 'compact')).toBe('1:02:05');
    });

    it('pads single-digit seconds and minutes past the leading unit', () => {
      expect(pipe.transform(65, 'compact')).toBe('1:05');
    });

    it('does not depend on locale', () => {
      translation.setLocale('th');
      const thResult = pipe.transform(3725, 'compact');
      translation.setLocale('en');
      const enResult = pipe.transform(3725, 'compact');
      expect(thResult).toBe(enResult);
    });
  });

  // Regression coverage for a real bug found reviewing CourseDetailPage (P1-22): a `pure: true`
  // version of this pipe passed every test above (all direct .transform() calls) yet silently kept
  // stale-language text after a live locale toggle in the actual app — pure pipes only re-run when
  // their own explicit arguments change, not when a signal merely read inside transform() changes.
  // These tests render through a real template binding, the only way that class of bug shows up.
  describe('template reactivity (pure: false)', () => {
    @Component({ template: `{{ 9000 | duration }}`, imports: [DurationPipe] })
    class DurationHost {}

    let fixture: ComponentFixture<DurationHost>;

    beforeEach(() => {
      fixture = TestBed.createComponent(DurationHost);
    });

    it('updates the rendered text live when the locale changes, without re-navigating', () => {
      TestBed.inject(TranslationService).setLocale('en');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.trim()).toBe('2h 30m');

      TestBed.inject(TranslationService).setLocale('th');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.trim()).toBe('2 ชม. 30 นาที');
    });
  });
});
