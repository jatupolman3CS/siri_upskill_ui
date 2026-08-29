/**
 * Pure schema.org JSON-LD object builders (task P1-24) — kept separate from any one page's component
 * because the complexity worth isolating here is "build a correct schema.org shape", not duplication
 * avoidance; `CourseDetailPage` is the first consumer, but the shapes themselves are standard enough
 * that a future content page (e.g. the P6 blog) can reuse `buildBreadcrumbListJsonLd` without knowing
 * anything about courses.
 */

export interface CourseJsonLdInput {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly image: string | null;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly providerName: string;
  readonly providerUrl: string;
}

/** Builds a schema.org `Course` object, per Google's Course structured-data guidance. `aggregateRating`
 * is only included when `ratingCount > 0` — `CourseStatsUpdater` (task P1-08) hasn't shipped yet, so
 * every course's `ratingCount` is genuinely 0 today; emitting a fabricated rating for a course nobody
 * has rated risks a Search Console structured-data violation, not just an inaccuracy. */
export function buildCourseJsonLd(input: CourseJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: input.name,
    description: input.description,
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    provider: {
      '@type': 'Organization',
      name: input.providerName,
      sameAs: input.providerUrl,
    },
    ...(input.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.ratingAverage,
            ratingCount: input.ratingCount,
          },
        }
      : {}),
  };
}

export interface BreadcrumbListItemInput {
  readonly name: string;
  readonly url: string;
}

/** Builds a schema.org `BreadcrumbList` — every item (including the current page, last in the list)
 * carries its own absolute `item` URL, matching Google's own breadcrumb structured-data example. */
export function buildBreadcrumbListJsonLd(items: readonly BreadcrumbListItemInput[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface LearningPathJsonLdInput {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly items: readonly { name: string; url: string; position: number }[];
}

export function buildLearningPathJsonLd(input: LearningPathJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    description: input.description,
    url: input.url,
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      url: item.url,
    })),
  };
}
