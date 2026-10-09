import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import {
  CATEGORY_MAX_SLUG_LENGTH,
  CATEGORY_SLUG_PATTERN,
  buildMovedOrder,
  collectSubtreeIds,
  findNode,
  flattenTree,
  selectableParents,
  suggestSlug,
} from './category-admin.util';

function node(id: string, children: CategoryTreeNode[] = [], isActive = true): CategoryTreeNode {
  return { id, slug: id, nameTh: `th-${id}`, nameEn: `en-${id}`, iconKey: null, sortOrder: 0, isActive, children };
}

// root1 ── child1 ── grandchild
//       └─ child2
// root2
const TREE: CategoryTreeNode[] = [node('root1', [node('child1', [node('grandchild')]), node('child2')]), node('root2')];

describe('suggestSlug', () => {
  it('lowercases, hyphenates and drops everything outside a-z0-9', () => {
    expect(suggestSlug('Web Development & Design!')).toBe('web-development-design');
  });

  it('returns an empty string for a Thai-only input (the admin must type a Latin slug)', () => {
    expect(suggestSlug('การตลาด')).toBe('');
  });

  it('keeps the Latin part of a mixed name and strips accents', () => {
    expect(suggestSlug('Café การตลาด Basics')).toBe('cafe-basics');
  });

  it('never ends or starts with a hyphen and respects the 100 character limit', () => {
    const slug = suggestSlug(`--${'a'.repeat(99)} b--`);
    expect(slug.length).toBeLessThanOrEqual(CATEGORY_MAX_SLUG_LENGTH);
    expect(slug).toMatch(CATEGORY_SLUG_PATTERN);
  });

  it('always produces something the backend slug pattern accepts, or an empty string', () => {
    for (const text of ['Hello World', 'a--b', '  spaced  out  ', '100% Off', 'C# / .NET']) {
      const slug = suggestSlug(text);
      expect(slug === '' || CATEGORY_SLUG_PATTERN.test(slug), slug).toBe(true);
    }
  });
});

describe('CATEGORY_SLUG_PATTERN (mirrors the backend ^[a-z0-9]+(-[a-z0-9]+)*$)', () => {
  it.each(['a', 'web-development', 'a1-b2-c3'])('accepts %s', (slug) => {
    expect(CATEGORY_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each(['', 'Web', 'web_dev', '-web', 'web-', 'web--dev', 'เว็บ', 'web dev'])('rejects %j', (slug) => {
    expect(CATEGORY_SLUG_PATTERN.test(slug)).toBe(false);
  });
});

describe('flattenTree', () => {
  it('lists parents before their children, with depth, parent id and sibling position', () => {
    const rows = flattenTree(TREE);

    expect(rows.map((row) => row.node.id)).toEqual(['root1', 'child1', 'grandchild', 'child2', 'root2']);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 1, 0]);
    expect(rows.map((row) => row.parentId)).toEqual([null, 'root1', 'child1', 'root1', null]);
    const child2 = rows.find((row) => row.node.id === 'child2');
    expect(child2?.index).toBe(1);
    expect(child2?.siblingCount).toBe(2);
  });

  it('is empty for an empty tree', () => {
    expect(flattenTree([])).toEqual([]);
  });
});

describe('collectSubtreeIds / findNode', () => {
  it('collects a category and every descendant', () => {
    expect([...collectSubtreeIds(TREE[0])].sort()).toEqual(['child1', 'child2', 'grandchild', 'root1']);
  });

  it('finds a nested node by id and returns null for an unknown one', () => {
    expect(findNode(TREE, 'grandchild')?.id).toBe('grandchild');
    expect(findNode(TREE, 'missing')).toBeNull();
  });
});

describe('selectableParents', () => {
  it('offers every category when creating', () => {
    expect(selectableParents(TREE, null)).toHaveLength(5);
  });

  it('excludes the edited category and its whole subtree (cycle prevention)', () => {
    const ids = selectableParents(TREE, TREE[0]).map((row) => row.node.id);
    expect(ids).toEqual(['root2']);
  });

  it('still offers the siblings and ancestors of a deeper category', () => {
    const child1 = TREE[0].children[0];
    const ids = selectableParents(TREE, child1).map((row) => row.node.id);
    expect(ids).toEqual(['root1', 'child2', 'root2']);
  });
});

describe('buildMovedOrder', () => {
  const siblings = [node('a'), node('b'), node('c')];

  it('swaps with the previous sibling and renumbers EVERY sibling 0..n-1 (the endpoint rejects partial sets)', () => {
    expect(buildMovedOrder(siblings, 1, 'up')).toEqual([
      { categoryId: 'b', sortOrder: 0 },
      { categoryId: 'a', sortOrder: 1 },
      { categoryId: 'c', sortOrder: 2 },
    ]);
  });

  it('swaps with the next sibling when moving down', () => {
    expect(buildMovedOrder(siblings, 1, 'down')?.map((item) => item.categoryId)).toEqual(['a', 'c', 'b']);
  });

  it('produces distinct sort values (the validator rejects duplicates)', () => {
    const values = buildMovedOrder(siblings, 0, 'down')?.map((item) => item.sortOrder) ?? [];
    expect(new Set(values).size).toBe(values.length);
  });

  it('returns null when the move would leave the list', () => {
    expect(buildMovedOrder(siblings, 0, 'up')).toBeNull();
    expect(buildMovedOrder(siblings, 2, 'down')).toBeNull();
    expect(buildMovedOrder(siblings, 5, 'up')).toBeNull();
  });

  it('does not mutate the input', () => {
    const before = siblings.map((sibling) => sibling.id);
    buildMovedOrder(siblings, 0, 'down');
    expect(siblings.map((sibling) => sibling.id)).toEqual(before);
  });
});
