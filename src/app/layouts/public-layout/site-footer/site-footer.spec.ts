import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TranslationService } from '../../../core/i18n/translation.service';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  let fixture: ComponentFixture<SiteFooter>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SiteFooter], providers: [provideRouter([])] });
    TestBed.inject(TranslationService).setLocale('en');
    fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const hrefs = (): string[] => Array.from(root().querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');

  it('keeps only the everyday links, the legal links and the brand home link', () => {
    expect(hrefs()).toEqual([
      '/',
      '/courses',
      '/blog',
      '/faq',
      '/contact',
      '/certificates/verify',
      '/terms',
      '/privacy',
      '/refund-policy',
    ]);
  });

  it('does not carry account, studio, admin or PDPA entries (those live in the account menu)', () => {
    const forbidden = ['/my-courses', '/account/privacy', '/instructor', '/become-instructor', '/admin'];

    for (const href of forbidden) {
      expect(hrefs()).not.toContain(href);
    }
  });

  it('renders the tagline and the copyright line', () => {
    expect(root().textContent).toContain('An online learning platform');
    expect(root().textContent).toContain(`© ${new Date().getFullYear()} SIRI UpSkill`);
  });

  it('labels both link groups as navigation landmarks', () => {
    const labels = Array.from(root().querySelectorAll('nav')).map((nav) => nav.getAttribute('aria-label'));

    expect(labels).toEqual(['Useful links', 'Legal']);
  });
});
