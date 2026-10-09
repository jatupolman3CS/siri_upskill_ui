import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { ReorderCategoryItem } from './data/admin-category-api.models';

/**
 * Limits and format copied from the backend (`CreateCategoryValidator` / `UpdateCategoryValidator`): the slug is
 * lowercase ASCII letters/digits separated by single hyphens, no leading/trailing/doubled hyphen. Mirrored here only so
 * the form can reject early — the server validates again and stays the authority.
 */
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CATEGORY_MAX_SLUG_LENGTH = 100;
export const CATEGORY_MAX_NAME_LENGTH = 200;
export const CATEGORY_MAX_ICON_KEY_LENGTH = 100;

/**
 * Turns free text (the English name) into a slug suggestion. Thai text is dropped on purpose — there is no Thai-to-Latin
 * generator for categories on the server, so the admin must supply/confirm a Latin slug; an all-Thai input yields `''`.
 */
export function suggestSlug(text: string): string {
  const slug = text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CATEGORY_MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug;
}

/** One visible row of the flattened tree. */
export interface CategoryRow {
  readonly node: CategoryTreeNode;
  /** 0 for a root category. */
  readonly depth: number;
  readonly parentId: string | null;
  /** Position among the siblings under the same parent (0-based), in the order the server returned them. */
  readonly index: number;
  readonly siblingCount: number;
}

/** Depth-first flatten, parents before children — the order the rows are rendered in. */
export function flattenTree(nodes: readonly CategoryTreeNode[], depth = 0, parentId: string | null = null): CategoryRow[] {
  const rows: CategoryRow[] = [];
  nodes.forEach((node, index) => {
    rows.push({ node, depth, parentId, index, siblingCount: nodes.length });
    rows.push(...flattenTree(node.children, depth + 1, node.id));
  });
  return rows;
}

/** A category and every category beneath it. */
export function collectSubtreeIds(node: CategoryTreeNode): ReadonlySet<string> {
  const ids = new Set<string>([node.id]);
  for (const child of node.children) {
    collectSubtreeIds(child).forEach((id) => ids.add(id));
  }
  return ids;
}

export function findNode(nodes: readonly CategoryTreeNode[], id: string): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findNode(node.children, id);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Categories a given category may be moved under. A category can never become a child of itself or of anything
 * in its own subtree (the server rejects that with a 400 too — filtering here just keeps the choice out of the list).
 * `excluding` is `null` when creating.
 */
export function selectableParents(tree: readonly CategoryTreeNode[], excluding: CategoryTreeNode | null): CategoryRow[] {
  const blocked = excluding ? collectSubtreeIds(excluding) : new Set<string>();
  return flattenTree(tree).filter((row) => !blocked.has(row.node.id));
}

/**
 * The reorder payload after moving `siblings[index]` one step. The endpoint wants the FULL sibling set with distinct
 * sort values, so every sibling is renumbered `0..n-1` in its new order. Returns `null` when the move is out of range.
 */
export function buildMovedOrder(
  siblings: readonly CategoryTreeNode[],
  index: number,
  direction: 'up' | 'down',
): ReorderCategoryItem[] | null {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= siblings.length || target < 0 || target >= siblings.length) {
    return null;
  }
  const ids = siblings.map((sibling) => sibling.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids.map((categoryId, sortOrder) => ({ categoryId, sortOrder }));
}
