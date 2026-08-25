import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from './translation.service';
import { TranslatePipe } from './translate.pipe';

describe('TranslatePipe', () => {
  let pipe: TranslatePipe;
  let translation: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    pipe = TestBed.runInInjectionContext(() => new TranslatePipe());
    translation = TestBed.inject(TranslationService);
  });

  it('resolves a dot-path key against the active dictionary', () => {
    translation.setLocale('en');
    expect(pipe.transform('common.loading')).toBe('Loading...');

    translation.setLocale('th');
    expect(pipe.transform('common.loading')).toBe('กำลังโหลด...');
  });

  it('returns the key itself when not found in the dictionary', () => {
    expect(pipe.transform('does.not.exist')).toBe('does.not.exist');
  });

  it('interpolates params into the resolved string', () => {
    translation.setLocale('en');
    expect(pipe.transform('shared.pagination.goToPage', { page: 3 })).toContain('3');
  });

  // Regression coverage for a real bug: a `pure: true` version of this pipe passed every test above
  // (all direct .transform() calls) yet silently kept stale-language text after a live locale toggle
  // in the actual app — pure pipes only re-run when their own explicit arguments change, not when a
  // signal merely read inside transform() changes. These tests render through a real template binding,
  // the only way that class of bug shows up. See DurationPipe's doc comment for the full explanation.
  describe('template reactivity (pure: false)', () => {
    @Component({ template: `{{ 'common.loading' | translate }}`, imports: [TranslatePipe] })
    class TranslateHost {}

    let fixture: ComponentFixture<TranslateHost>;

    beforeEach(() => {
      fixture = TestBed.createComponent(TranslateHost);
    });

    it('updates the rendered text live when the locale changes, without re-navigating', () => {
      TestBed.inject(TranslationService).setLocale('en');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.trim()).toBe('Loading...');

      TestBed.inject(TranslationService).setLocale('th');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.trim()).toBe('กำลังโหลด...');
    });
  });
});
