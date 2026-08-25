import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { TranslationService } from './translation.service';
import { CurrencyThbPipe } from './currency-thb.pipe';

// Real app bootstrap registers this once in app.config.ts; this isolated pipe spec never loads that
// file, so it needs its own registration or CurrencyPipe throws NG0701 for the 'th-TH' locale.
registerLocaleData(localeTh);

describe('CurrencyThbPipe', () => {
  let pipe: CurrencyThbPipe;
  let translation: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CurrencyPipe] });
    pipe = TestBed.runInInjectionContext(() => new CurrencyThbPipe());
    translation = TestBed.inject(TranslationService);
  });

  it('returns null for null/undefined input', () => {
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
  });

  it('formats a THB amount using Thai grouping/decimal conventions when locale is th', () => {
    translation.setLocale('th');
    const result = pipe.transform(1990);
    expect(result).toContain('1,990');
  });

  it('formats a THB amount using English grouping/decimal conventions when locale is en', () => {
    translation.setLocale('en');
    const result = pipe.transform(1990);
    expect(result).toContain('1,990');
  });

  it('always shows exactly 2 decimal places, even for a whole number', () => {
    translation.setLocale('en');
    expect(pipe.transform(990.5)).toContain('990.50');
    expect(pipe.transform(990)).toContain('990.00');
  });

  // Regression coverage for a real bug: a `pure: true` version of this pipe passed every test above
  // (all direct .transform() calls) yet silently kept the stale locale's number format after a live
  // locale toggle in the actual app — pure pipes only re-run when their own explicit arguments change,
  // not when a signal merely read inside transform() changes. These tests render through a real
  // template binding, the only way that class of bug shows up. See DurationPipe's doc comment for the
  // full explanation.
  //
  // Unlike DurationPipe (Thai vs. English words differ visibly), th-TH and en-US render THB currency
  // as byte-identical strings for every amount (verified: both use Latin digits, comma grouping, period
  // decimal — confirmed via Node's Intl.NumberFormat directly) — so a rendered-text-diff assertion can
  // never catch this bug for this pipe specifically. Instead this asserts the actual mechanism: with
  // `pure: false`, Angular re-invokes `transform()` on every change-detection cycle regardless of
  // whether its explicit argument changed; with `pure: true` it would not, and the second `transform`
  // call below would never happen.
  describe('template reactivity (pure: false)', () => {
    @Component({
      template: `{{ 1990 | currencyThb }}`,
      imports: [CurrencyThbPipe],
    })
    class CurrencyThbHost {}

    let fixture: ComponentFixture<CurrencyThbHost>;

    beforeEach(() => {
      fixture = TestBed.createComponent(CurrencyThbHost);
    });

    it('re-invokes transform on a locale change even though the bound argument (1990) is unchanged', () => {
      const transformSpy = vi.spyOn(CurrencyThbPipe.prototype, 'transform');

      fixture.detectChanges();
      const callsAfterFirstCheck = transformSpy.mock.calls.length;
      expect(callsAfterFirstCheck).toBeGreaterThan(0);

      TestBed.inject(TranslationService).setLocale('en');
      fixture.detectChanges();

      expect(transformSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstCheck);
    });
  });
});
