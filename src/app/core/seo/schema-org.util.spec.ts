import { buildBreadcrumbListJsonLd, buildCourseJsonLd } from './schema-org.util';

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
