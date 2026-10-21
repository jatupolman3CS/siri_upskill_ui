import { describe, expect, it } from 'vitest';
import {
  buildArticleJsonLd,
  buildBreadcrumbListJsonLd,
  buildCourseJsonLd,
  buildFaqPageJsonLd,
  buildItemListJsonLd,
  buildOrganizationJsonLd,
  buildTutorPersonJsonLd,
  buildWebSiteJsonLd,
} from './schema-org.util';

describe('buildCourseJsonLd', () => {
  const BASE_INPUT = {
    name: 'Python for Beginners',
    description: 'Learn Python from scratch',
    url: 'https://example.test/courses/python-for-beginners',
    image: null,
    ratingAverage: 0,
    ratingCount: 0,
    providerName: 'SIRI UpSkill',
    providerUrl: 'https://example.test/',
  };

  it('builds a Course object with the schema.org context/type and core fields', () => {
    const result = buildCourseJsonLd(BASE_INPUT);

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('Course');
    expect(result['name']).toBe('Python for Beginners');
    expect(result['description']).toBe('Learn Python from scratch');
    expect(result['url']).toBe('https://example.test/courses/python-for-beginners');
    expect(result['provider']).toEqual({
      '@type': 'Organization',
      name: 'SIRI UpSkill',
      sameAs: 'https://example.test/',
    });
  });

  it('omits aggregateRating entirely when ratingCount is 0 — does not fabricate a rating', () => {
    const result = buildCourseJsonLd({ ...BASE_INPUT, ratingCount: 0, ratingAverage: 0 });
    expect(result['aggregateRating']).toBeUndefined();
  });

  it('includes aggregateRating only when ratingCount is greater than 0', () => {
    const result = buildCourseJsonLd({ ...BASE_INPUT, ratingCount: 12, ratingAverage: 4.5 });
    expect(result['aggregateRating']).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      ratingCount: 12,
    });
  });

  it('omits image when null, includes it when present', () => {
    expect(buildCourseJsonLd({ ...BASE_INPUT, image: null })['image']).toBeUndefined();
    expect(buildCourseJsonLd({ ...BASE_INPUT, image: 'https://example.test/thumb.jpg' })['image']).toBe(
      'https://example.test/thumb.jpg',
    );
  });
});

describe('buildBreadcrumbListJsonLd', () => {
  it('builds a BreadcrumbList with 1-based position numbering and every item carrying an absolute url', () => {
    const result = buildBreadcrumbListJsonLd([
      { name: 'Home', url: 'https://example.test/' },
      { name: 'Courses', url: 'https://example.test/courses' },
      { name: 'Python for Beginners', url: 'https://example.test/courses/python-for-beginners' },
    ]);

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('BreadcrumbList');
    expect(result['itemListElement']).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.test/' },
      { '@type': 'ListItem', position: 2, name: 'Courses', item: 'https://example.test/courses' },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Python for Beginners',
        item: 'https://example.test/courses/python-for-beginners',
      },
    ]);
  });

  it('builds an empty itemListElement for an empty trail', () => {
    expect(buildBreadcrumbListJsonLd([])['itemListElement']).toEqual([]);
  });
});

describe('buildTutorPersonJsonLd', () => {
  const BASE_INPUT = {
    name: 'Nina Tutor',
    description: 'Physics tutor for upper secondary students.',
    url: 'https://example.test/tutors/nina-tutor',
    image: 'https://example.test/api/tutoring/tutors/nina-tutor/photo?v=abc',
    jobTitle: 'Physics tutor',
    knowsAbout: ['Physics', 'Mathematics'],
    ratingAverage: 0,
    ratingCount: 0,
  };

  it('builds a Person with the schema.org context/type and the public profile fields only', () => {
    const result = buildTutorPersonJsonLd(BASE_INPUT);

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('Person');
    expect(result['name']).toBe('Nina Tutor');
    expect(result['jobTitle']).toBe('Physics tutor');
    expect(result['knowsAbout']).toEqual(['Physics', 'Mathematics']);
    expect(result['image']).toBe(BASE_INPUT.image);
    expect(Object.keys(result).sort()).toEqual(['@context', '@type', 'description', 'image', 'jobTitle', 'knowsAbout', 'name', 'url']);
  });

  it('omits aggregateRating when ratingCount is 0 - does not fabricate a rating', () => {
    expect(buildTutorPersonJsonLd(BASE_INPUT)['aggregateRating']).toBeUndefined();
  });

  it('includes aggregateRating only when ratingCount is greater than 0', () => {
    expect(buildTutorPersonJsonLd({ ...BASE_INPUT, ratingAverage: 4.8, ratingCount: 21 })['aggregateRating']).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.8,
      ratingCount: 21,
    });
  });

  it('omits image, jobTitle and knowsAbout when the tutor has none', () => {
    const result = buildTutorPersonJsonLd({ ...BASE_INPUT, image: null, jobTitle: null, knowsAbout: [] });
    expect(result['image']).toBeUndefined();
    expect(result['jobTitle']).toBeUndefined();
    expect(result['knowsAbout']).toBeUndefined();
  });
});

describe('buildOrganizationJsonLd', () => {
  it('builds an Organization schema with optional logo, description, and sameAs links', () => {
    const result = buildOrganizationJsonLd({
      name: 'SIRI UpSkill',
      url: 'https://example.test/',
      logo: 'https://example.test/logo.png',
      description: 'Online learning platform',
      sameAs: ['https://facebook.com/siriupskill', 'https://youtube.com/@siriupskill'],
    });

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('Organization');
    expect(result['name']).toBe('SIRI UpSkill');
    expect(result['url']).toBe('https://example.test/');
    expect(result['logo']).toBe('https://example.test/logo.png');
    expect(result['description']).toBe('Online learning platform');
    expect(result['sameAs']).toEqual(['https://facebook.com/siriupskill', 'https://youtube.com/@siriupskill']);
  });
});

describe('buildWebSiteJsonLd', () => {
  it('builds a WebSite schema with SearchAction when searchTargetUrl is provided', () => {
    const result = buildWebSiteJsonLd({
      name: 'SIRI UpSkill',
      url: 'https://example.test/',
      searchTargetUrl: 'https://example.test/courses?q={search_term_string}',
    });

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('WebSite');
    expect(result['name']).toBe('SIRI UpSkill');
    expect(result['url']).toBe('https://example.test/');
    expect(result['potentialAction']).toEqual({
      '@type': 'SearchAction',
      target: 'https://example.test/courses?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    });
  });
});

describe('buildArticleJsonLd', () => {
  it('builds a BlogPosting schema with author, datePublished, and publisher', () => {
    const result = buildArticleJsonLd({
      headline: 'Introduction to Angular 22',
      description: 'Learn what is new in Angular 22',
      url: 'https://example.test/blog/angular-22',
      image: 'https://example.test/blog/cover.jpg',
      datePublished: '2026-10-10T00:00:00Z',
      dateModified: '2026-10-15T00:00:00Z',
      authorName: 'Tech Lead',
      publisherName: 'SIRI UpSkill',
      publisherUrl: 'https://example.test/',
      publisherLogo: 'https://example.test/logo.png',
    });

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('BlogPosting');
    expect(result['headline']).toBe('Introduction to Angular 22');
    expect(result['datePublished']).toBe('2026-10-10T00:00:00Z');
    expect(result['dateModified']).toBe('2026-10-15T00:00:00Z');
    expect(result['author']).toEqual({ '@type': 'Person', name: 'Tech Lead' });
    expect(result['publisher']).toEqual({
      '@type': 'Organization',
      name: 'SIRI UpSkill',
      url: 'https://example.test/',
      logo: { '@type': 'ImageObject', url: 'https://example.test/logo.png' },
    });
  });
});

describe('buildFaqPageJsonLd', () => {
  it('builds a FAQPage schema with Question and Answer elements', () => {
    const result = buildFaqPageJsonLd([
      { question: 'What is SIRI UpSkill?', answer: 'It is an online learning platform.' },
      { question: 'How can I pay?', answer: 'Via PromptPay and credit cards.' },
    ]);

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('FAQPage');
    expect(result['mainEntity']).toEqual([
      {
        '@type': 'Question',
        name: 'What is SIRI UpSkill?',
        acceptedAnswer: { '@type': 'Answer', text: 'It is an online learning platform.' },
      },
      {
        '@type': 'Question',
        name: 'How can I pay?',
        acceptedAnswer: { '@type': 'Answer', text: 'Via PromptPay and credit cards.' },
      },
    ]);
  });
});

describe('buildItemListJsonLd', () => {
  it('builds an ItemList schema with list items and positions', () => {
    const result = buildItemListJsonLd('Featured Courses', [
      { name: 'Course 1', url: 'https://example.test/courses/1', position: 1 },
      { name: 'Course 2', url: 'https://example.test/courses/2', position: 2 },
    ]);

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('ItemList');
    expect(result['name']).toBe('Featured Courses');
    expect(result['numberOfItems']).toBe(2);
    expect(result['itemListElement']).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Course 1', url: 'https://example.test/courses/1' },
      { '@type': 'ListItem', position: 2, name: 'Course 2', url: 'https://example.test/courses/2' },
    ]);
  });
});

