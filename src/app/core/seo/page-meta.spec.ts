import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { setPageMeta } from './page-meta';
import { SeoService } from './seo.service';

describe('setPageMeta', () => {
  let document: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    document = TestBed.inject(DOCUMENT);
  });

  it('sets title and description, with no robots tag by default', () => {
    TestBed.runInInjectionContext(() => setPageMeta({ title: 'Sign up', description: 'Create an account' }));

    expect(TestBed.inject(Title).getTitle()).toBe('Sign up');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Create an account');
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('sets robots=noindex when requested', () => {
    TestBed.runInInjectionContext(() => setPageMeta({ title: 'Reset password', description: 'Set a new password', robots: 'noindex' }));

    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  // Regression test for a real bug: a page using this smaller helper is reachable by ordinary SPA
  // navigation from a page that called SeoService.set() directly (e.g. CourseDetailPage -> /login via
  // the site header). Before setPageMeta() delegated to SeoService, it never cleared canonical/OG/
  // JSON-LD, so a page like /login could silently keep showing a previous course page's canonical URL,
  // Open Graph image, and Course/BreadcrumbList structured data.
  it('clears canonical/OG image/JSON-LD left behind by a prior SeoService.set() call, and refreshes the canonical URL', () => {
    const seoService = TestBed.inject(SeoService);
    seoService.set({
      title: 'Python for Beginners',
      description: 'Learn Python from scratch',
      path: '/courses/python-for-beginners',
      openGraph: { image: 'https://cdn.test/thumb.jpg' },
      jsonLd: [{ '@type': 'Course' }, { '@type': 'BreadcrumbList' }],
    });
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(2);
    expect(document.querySelector('meta[property="og:image"]')).not.toBeNull();

    TestBed.runInInjectionContext(() => setPageMeta({ title: 'Sign up', description: 'Create an account' }));

    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
    // The canonical link itself is expected to persist (SeoService always sets one) — what matters is
    // that it was actually refreshed to this page, not left pointing at the stale course URL.
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).not.toContain('/courses/python-for-beginners');
  });

  it('clears a stale robots=noindex left behind by a prior SeoService.set() call when this call does not request one', () => {
    const seoService = TestBed.inject(SeoService);
    seoService.set({ title: 'Course not found', description: 'Not found', path: '/courses/missing', robots: 'noindex' });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');

    TestBed.runInInjectionContext(() => setPageMeta({ title: 'Sign up', description: 'Create an account' }));

    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});
