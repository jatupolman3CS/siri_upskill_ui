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

export interface TutorPersonJsonLdInput {
  readonly name: string;
  /** Already shortened by the caller (the contract caps the bio at 300 characters). */
  readonly description: string;
  readonly url: string;
  /** Absolute URL of the profile photo, or `null` when the tutor has none. */
  readonly image: string | null;
  readonly jobTitle: string | null;
  /** Subject names in the active language. */
  readonly knowsAbout: readonly string[];
  readonly ratingAverage: number;
  readonly ratingCount: number;
}

/** Builds a schema.org `Person` for a public tutor profile (P13-04). Deliberately carries no contact, identity or KYC
 * data - only what the profile page itself already shows. `aggregateRating` is included only when `ratingCount > 0`
 * (same structured-data-spam concern as `buildCourseJsonLd`); no `Review` objects until real reviews exist (P13-13). */
export function buildTutorPersonJsonLd(input: TutorPersonJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: input.name,
    description: input.description,
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
    ...(input.knowsAbout.length > 0 ? { knowsAbout: [...input.knowsAbout] } : {}),
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

export interface OrganizationJsonLdInput {
  readonly name: string;
  readonly url: string;
  readonly logo?: string | null;
  readonly description?: string | null;
  readonly sameAs?: readonly string[];
}

export function buildOrganizationJsonLd(input: OrganizationJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.sameAs && input.sameAs.length > 0 ? { sameAs: [...input.sameAs] } : {}),
  };
}

export interface WebSiteJsonLdInput {
  readonly name: string;
  readonly url: string;
  readonly searchTargetUrl?: string | null;
}

export function buildWebSiteJsonLd(input: WebSiteJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    ...(input.searchTargetUrl
      ? {
          potentialAction: {
            '@type': 'SearchAction',
            target: input.searchTargetUrl,
            'query-input': 'required name=search_term_string',
          },
        }
      : {}),
  };
}

export interface ArticleJsonLdInput {
  readonly headline: string;
  readonly description: string;
  readonly url: string;
  readonly image?: string | null;
  readonly datePublished: string;
  readonly dateModified?: string | null;
  readonly authorName?: string | null;
  readonly publisherName?: string;
  readonly publisherUrl?: string;
  readonly publisherLogo?: string | null;
}

export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.headline,
    description: input.description,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': input.url,
    },
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    ...(input.authorName
      ? {
          author: {
            '@type': 'Person',
            name: input.authorName,
          },
        }
      : {}),
    publisher: {
      '@type': 'Organization',
      name: input.publisherName ?? 'SIRI UpSkill',
      ...(input.publisherUrl ? { url: input.publisherUrl } : {}),
      ...(input.publisherLogo ? { logo: { '@type': 'ImageObject', url: input.publisherLogo } } : {}),
    },
  };
}

export interface FaqItemJsonLdInput {
  readonly question: string;
  readonly answer: string;
}

export function buildFaqPageJsonLd(items: readonly FaqItemJsonLdInput[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export interface ItemListEntryInput {
  readonly name: string;
  readonly url: string;
  readonly position: number;
  readonly description?: string | null;
  readonly image?: string | null;
}

export function buildItemListJsonLd(name: string, items: readonly ItemListEntryInput[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      url: item.url,
      ...(item.description ? { description: item.description } : {}),
      ...(item.image ? { image: item.image } : {}),
    })),
  };
}

