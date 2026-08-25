import { CategoryTreeNode } from './data/category-api.models';

/**
 * Depth-first search for the node whose `slug` matches, at any level of the tree — needed because
 * URLs (mega menu links, `CoursesPage`'s own `?category=` param) use the human-readable slug, while
 * `SearchCoursesQuery.categoryId` needs the real id. Returns `undefined` if nothing matches (an
 * unknown/typed-by-hand slug in the URL — `CoursesPage` treats that the same as "no category filter",
 * not an error).
 */
export function findCategoryBySlug(categories: readonly CategoryTreeNode[], slug: string): CategoryTreeNode | undefined {
  for (const category of categories) {
    if (category.slug === slug) {
      return category;
    }
    const foundInChildren = findCategoryBySlug(category.children, slug);
    if (foundInChildren) {
      return foundInChildren;
    }
  }
  return undefined;
}

/** Depth-first search by id — the inverse lookup `CoursesPage` needs to render a facet's `categoryId`
 * (from `CourseSearchFacets.categories`) as a human-readable name. */
export function findCategoryById(categories: readonly CategoryTreeNode[], id: string): CategoryTreeNode | undefined {
  for (const category of categories) {
    if (category.id === id) {
      return category;
    }
    const foundInChildren = findCategoryById(category.children, id);
    if (foundInChildren) {
      return foundInChildren;
    }
  }
  return undefined;
}
