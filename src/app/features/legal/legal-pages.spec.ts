import { Type } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { Locale, TranslationService } from '../../core/i18n/translation.service';
import { ContactPage } from './contact-page/contact-page';
import { LEGAL_CONTACT_EMAILS } from './legal-contact';
import { PrivacyPage } from './privacy-page/privacy-page';
import { RefundPolicyPage } from './refund-policy-page/refund-policy-page';
import { TermsPage } from './terms-page/terms-page';

/** Numbers/dates/claims the old hardcoded copy carried that nothing in the backend or the docs backs. */
const UNBACKED: Record<Locale, readonly string[]> = {
  th: [
    '27 สิงหาคม 2569', // invented "last updated" date
    '7 วัน', // refund window the system never enforces
    '20%', // refund progress cap the system never enforces
    '5-10 วันทำการ',
    '3-5 วันทำการ',
    'TLS 1.3',
    'PCI-DSS',
    'JCB',
    '09:00 - 18:00', // invented office hours
    'เบอร์โทรศัพท์', // phone numbers are never collected
    'ตลอดชีพ',
  ],
  en: ['27 August', '7 days', '20%', '5-10 business days', '3-5 business days', 'TLS 1.3', 'PCI-DSS', 'JCB', '09:00', 'phone number', 'lifetime'],
};

const PAGES: readonly { readonly name: string; readonly component: Type<unknown> }[] = [
  { name: 'TermsPage', component: TermsPage },
  { name: 'PrivacyPage', component: PrivacyPage },
  { name: 'RefundPolicyPage', component: RefundPolicyPage },
  { name: 'ContactPage', component: ContactPage },
];

describe('static legal pages', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
  });

  function render(component: Type<unknown>, locale: Locale): HTMLElement {
    TestBed.inject(TranslationService).setLocale(locale);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  for (const locale of ['th', 'en'] as const) {
    for (const page of PAGES) {
      it(`${page.name} renders from the ${locale} dictionary: no raw keys, no unbacked numbers or dates`, () => {
        const text = render(page.component, locale).textContent ?? '';

        expect(text.trim().length).toBeGreaterThan(100);
        expect(text).not.toMatch(/\b(legal|contact|faq)\.[a-z0-9]+\.?[a-zA-Z0-9.]*/);
        for (const claim of UNBACKED[locale]) {
          expect(text, `"${claim}" must not appear on ${page.name} (${locale})`).not.toContain(claim);
        }
      });
    }
  }

  it('the contact mailboxes come from one constants file and are used by the contact, privacy and refund pages', () => {
    const hrefs = (component: Type<unknown>): string[] =>
      Array.from(render(component, 'th').querySelectorAll('a[href^="mailto:"]')).map((a) => a.getAttribute('href') ?? '');

    expect(hrefs(ContactPage)).toEqual([
      `mailto:${LEGAL_CONTACT_EMAILS.support}`,
      `mailto:${LEGAL_CONTACT_EMAILS.dpo}`,
      `mailto:${LEGAL_CONTACT_EMAILS.business}`,
    ]);
    expect(hrefs(PrivacyPage)).toEqual([`mailto:${LEGAL_CONTACT_EMAILS.dpo}`]);
    expect(hrefs(RefundPolicyPage)).toEqual([`mailto:${LEGAL_CONTACT_EMAILS.support}`]);
  });

  it('the contact page uses icons, not emoji, for its channel list', () => {
    const root = render(ContactPage, 'th');

    expect(root.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(root.querySelectorAll('ng-icon').length).toBeGreaterThanOrEqual(3);
  });

  it('the refund policy covers the live-attendance block and the async PromptPay refund, without a fixed window', () => {
    const text = render(RefundPolicyPage, 'en').textContent ?? '';

    expect(text).toContain('joined a live classroom of a course at least once');
    expect(text).toContain('PromptPay refunds are asynchronous');
    expect(text).toContain('case by case');
  });

  it('the privacy policy lists only data that is actually collected and the real self-service rights', () => {
    const text = render(PrivacyPage, 'en').textContent ?? '';

    expect(text).toContain('export your personal data as a JSON file yourself');
    expect(text).toContain('anonymizes the account');
    expect(text).toContain('We do not store credit/debit card numbers');
    expect(text).toContain('AES-256-GCM');
    expect(text).toContain('Google');
  });

  it('the terms describe payments and access the way the backend works', () => {
    const text = render(TermsPage, 'en').textContent ?? '';

    expect(text).toContain('only once they are enabled');
    expect(text).toContain('The access period is set per course');
    expect(text).toContain('automatically signs out the device that has been signed in the longest');
  });
});
