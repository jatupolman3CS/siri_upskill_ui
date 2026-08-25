import { CategoryTreeNode } from './data/category-api.models';
import { findCategoryById, findCategoryBySlug } from './category-tree.util';

const LEAF: CategoryTreeNode = {
  id: 'leaf-id',
  slug: 'web-development',
  nameTh: 'พัฒนาเว็บ',
  nameEn: 'Web Development',
  iconKey: null,
  sortOrder: 0,
  isActive: true,
  children: [],
};

const TREE: readonly CategoryTreeNode[] = [
  {
    id: 'root-id',
    slug: 'programming-technology',
    nameTh: 'การเขียนโปรแกรมและเทคโนโลยี',
    nameEn: 'Programming & Technology',
    iconKey: 'code',
    sortOrder: 0,
    isActive: true,
    children: [LEAF],
  },
  {
    id: 'other-root-id',
    slug: 'finance-investment',
    nameTh: 'การเงินและการลงทุน',
    nameEn: 'Finance & Investment',
    iconKey: 'coins',
    sortOrder: 1,
    isActive: true,
    children: [],
  },
];

describe('findCategoryBySlug', () => {
  it('finds a root-level category by slug', () => {
    expect(findCategoryBySlug(TREE, 'finance-investment')?.id).toBe('other-root-id');
  });

  it('finds a nested category by slug', () => {
    expect(findCategoryBySlug(TREE, 'web-development')?.id).toBe('leaf-id');
  });

  it('returns undefined for a slug that does not exist anywhere in the tree', () => {
    expect(findCategoryBySlug(TREE, 'does-not-exist')).toBeUndefined();
  });
});

describe('findCategoryById', () => {
  it('finds a root-level category by id', () => {
    expect(findCategoryById(TREE, 'other-root-id')?.slug).toBe('finance-investment');
  });

  it('finds a nested category by id', () => {
    expect(findCategoryById(TREE, 'leaf-id')?.slug).toBe('web-development');
  });

  it('returns undefined for an id that does not exist anywhere in the tree', () => {
    expect(findCategoryById(TREE, 'does-not-exist')).toBeUndefined();
  });
});
