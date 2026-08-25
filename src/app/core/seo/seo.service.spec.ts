import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';

import { SeoService } from './seo.service';

describe('SeoService', () => {
  let service: SeoService;
  let document: Document;
  let origin: string;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SeoService);
    document = TestBed.inject(DOCUMENT);
    origin = document.location.origin;
  });

  it('absoluteUrl() joins the current origin with the given path', () => {
    expect(service.absoluteUrl('/courses/python-for-beginners')).toBe(`${origin}/courses/python-for-beginners`);
  });

  it('sets the document title and description meta tag', () => {
    service.set({ title: 'Python for Beginners | SIRI UpSkill', description: 'Learn Python from scratch', path: '/courses/python' });

    expect(TestBed.inject(Title).getTitle()).toBe('Python for Beginners | SIRI UpSkill');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Learn Python from scratch');
  });

  it('sets a canonical link with an absolute href, reusing the same element on a later call', () => {
    service.set({ title: 'A', description: 'A', path: '/courses/a' });
    const first = document.querySelector('link[rel="canonical"]');
    expect(first?.getAttribute('href')).toBe(`${origin}/courses/a`);

    service.set({ title: 'B', description: 'B', path: '/courses/b' });
    expect(document.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${origin}/courses/b`);
  });

  it('sets three hreflang alternates (th, en, x-default), all pointing at the same URL', () => {
    service.set({ title: 'A', description: 'A', path: '/courses/a' });

    for (const hreflang of ['th', 'en', 'x-default']) {
      const link = document.querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`);
      expect(link?.getAttribute('href')).toBe(`${origin}/courses/a`);
    }
  });

  it('sets Open Graph title/description/type/url, defaulting type to "website"', () => {
    service.set({ title: 'Python for Beginners', description: 'Learn Python', path: '/courses/python' });

    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Python for Beginners');
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe('Learn Python');
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('website');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${origin}/courses/python`);
  });

  it('sets og:image when an image is given, and removes it on a later call without one', () => {
    service.set({ title: 'A', description: 'A', path: '/courses/a', openGraph: { image: 'https://cdn.test/thumb.jpg' } });
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe('https://cdn.test/thumb.jpg');

    service.set({ title: 'B', description: 'B', path: '/courses/b' });
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
  });

  it('sets the robots meta tag to noindex when requested, and removes it once no longer requested', () => {
    service.set({ title: 'Not found', description: 'Not found', path: '/courses/missing', robots: 'noindex' });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');

    service.set({ title: 'Found', description: 'Found', path: '/courses/found' });
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  describe('JSON-LD', () => {
    it('renders one <script type="application/ld+json"> per item, with the exact given content', () => {
      service.set({
        title: 'A',
        description: 'A',
        path: '/courses/a',
        jsonLd: [
          { '@context': 'https://schema.org', '@type': 'Course', name: 'A' },
          { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] },
        ],
      });

      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      expect(scripts.length).toBe(2);
      expect(JSON.parse(scripts[0].textContent ?? '{}')).toEqual({ '@context': 'https://schema.org', '@type': 'Course', name: 'A' });
      expect(JSON.parse(scripts[1].textContent ?? '{}')).toEqual({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [],
      });
    });

    it('clears every previous JSON-LD script when the next call provides fewer (or none)', () => {
      service.set({
        title: 'A',
        description: 'A',
        path: '/courses/a',
        jsonLd: [{ '@type': 'Course' }, { '@type': 'BreadcrumbList' }],
      });
      expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(2);

      // Simulates navigating from CourseDetailPage (2 JSON-LD objects) to HomePage (none) — a stale
      // Course/BreadcrumbList script must not leak onto an unrelated page.
      service.set({ title: 'Home', description: 'Home', path: '/' });
      expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);
    });

    it('does not touch JSON-LD scripts it did not create', () => {
      const foreignScript = document.createElement('script');
      foreignScript.setAttribute('type', 'application/ld+json');
      foreignScript.textContent = '{"@type":"Organization"}';
      document.head.appendChild(foreignScript);

      service.set({ title: 'A', description: 'A', path: '/courses/a', jsonLd: [{ '@type': 'Course' }] });

      expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(2);
      foreignScript.remove();
    });
  });
});
