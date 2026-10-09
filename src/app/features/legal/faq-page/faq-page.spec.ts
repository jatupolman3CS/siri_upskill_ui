import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { Locale, TranslationService } from '../../../core/i18n/translation.service';
import { FaqPage } from './faq-page';

/** Claims the old hardcoded FAQ made that the system does not back (see the task notes for the facts). */
const FALSE_CLAIMS: Record<Locale, readonly string[]> = {
  th: ['ตลอดชีพ', 'Lifetime', 'JCB', '3 อุปกรณ์', 'ทุกที่ทุกเวลาบนทุกอุปกรณ์', 'ทันทีหลังชำระเงินสำเร็จ'],
  en: ['lifetime', 'JCB', '3 devices', 'instantly'],
};

describe('FaqPage', () => {
  let fixture: ComponentFixture<FaqPage>;
  let root: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(locale: Locale): void {
    TestBed.inject(TranslationService).setLocale(locale);
    fixture = TestBed.createComponent(FaqPage);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  }

  function questions(): string[] {
    return Array.from(root.querySelectorAll('details summary span')).map((el) => el.textContent?.trim() ?? '');
  }

  function tab(label: string): HTMLButtonElement {
    const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
    if (!button) {
      throw new Error(`filter tab "${label}" not found`);
    }
    return button;
  }

  function select(label: string): void {
    tab(label).click();
    fixture.detectChanges();
  }

  for (const locale of ['th', 'en'] as const) {
    it(`renders every question and answer from the ${locale} dictionary, with no raw i18n keys`, () => {
      render(locale);

      expect(questions().length).toBe(12);
      expect(root.querySelectorAll('details p').length).toBe(12);
      expect(root.textContent).not.toMatch(/faq\.(items|cat|title|subtitle)/);
      for (const item of Array.from(root.querySelectorAll('details'))) {
        expect(item.textContent?.trim().length).toBeGreaterThan(20);
      }
    });

    it(`does not repeat the claims the system does not back (${locale})`, () => {
      render(locale);
      const text = root.textContent ?? '';

      for (const claim of FALSE_CLAIMS[locale]) {
        expect(text, `"${claim}" must not appear in the ${locale} FAQ`).not.toContain(claim);
      }
    });
  }

  it('states payment facts that match the backend: PromptPay always, cards only when enabled, no installments', () => {
    render('en');
    const text = root.textContent ?? '';

    expect(text).toContain('PromptPay');
    expect(text).toContain('only once they are enabled');
    expect(text).toContain('Installment payments are not supported');
  });

  it('describes access as per-course rather than lifetime for everything', () => {
    render('en');

    expect(root.textContent).toContain('The access period is set per course');
  });

  it('has a Live classes group covering joining, invitations/reminders, replay, access period and refunds', () => {
    render('en');
    select('Live classes');

    const live = questions();
    expect(live.length).toBe(6);
    expect(live.some((q) => /join a live class/i.test(q))).toBe(true);
    expect(live.some((q) => /after buying a live course/i.test(q))).toBe(true);
    expect(live.some((q) => /missed/i.test(q))).toBe(true);
    expect(live.some((q) => /how long can i access/i.test(q))).toBe(true);
    expect(live.some((q) => /refund/i.test(q))).toBe(true);
  });

  it('explains that the live room needs sign-in and active access, that replay waits for the instructor, and the refund block', () => {
    render('en');
    select('Live classes');

    const text = root.textContent ?? '';
    expect(text).toContain('signed in and have active, unexpired access');
    expect(text).toContain('Classrooms are not recorded automatically');
    expect(text).toContain('once the instructor has uploaded the recording');
    expect(text).toContain('will not accept a refund request for that course');
  });

  it('marks the selected filter with aria-pressed and narrows the list', () => {
    render('en');

    expect(tab('All').getAttribute('aria-pressed')).toBe('true');
    select('Billing & Payments');

    expect(tab('Billing & Payments').getAttribute('aria-pressed')).toBe('true');
    expect(tab('All').getAttribute('aria-pressed')).toBe('false');
    expect(questions().length).toBe(2);
  });
});
