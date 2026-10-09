/**
 * Mirrors the admin category contract of `Siri.Api/Controllers/Catalog/CategoriesController.cs` and the records under
 * `Siri.Modules.Catalog/Features/{CreateCategory,UpdateCategory,ReorderCategories}`. Field names are copied verbatim
 * (camelCase on the wire). `GET /api/catalog/admin/categories` returns the same nested `CategoryTreeNode` shape the
 * public tree uses (`features/catalog/data/category-api.models.ts`) — it just also includes inactive categories — so
 * that interface is reused instead of redeclared.
 */

/** `CreateCategoryCommand` — `sortOrder` is deliberately absent: the server appends the new category to its siblings. */
export interface CreateCategoryRequest {
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly iconKey: string | null;
  readonly parentId: string | null;
}

/** `UpdateCategoryCommand` — also no `sortOrder` (owned by the reorder endpoint). The target id is in the route. */
export interface UpdateCategoryRequest {
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly iconKey: string | null;
  readonly parentId: string | null;
  readonly isActive: boolean;
}

/** `CreateCategoryResponse` and `UpdateCategoryResponse` have identical fields. */
export interface CategoryResponse {
  readonly id: string;
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly iconKey: string | null;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

/** `ReorderCategoryItem`. */
export interface ReorderCategoryItem {
  readonly categoryId: string;
  readonly sortOrder: number;
}

/**
 * `ReorderCategoriesCommand` — must name EVERY current sibling of one parent (the server rejects a partial batch with a
 * 400) and carry distinct `sortOrder` values.
 */
export interface ReorderCategoriesRequest {
  readonly items: readonly ReorderCategoryItem[];
}
