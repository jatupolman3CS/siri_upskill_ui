/**
 * Mirrors `backend/src/Siri.Modules.Catalog/Infrastructure/CategoryTreeAssembler.cs`'s
 * `CategoryTreeNode` record exactly — the wire response of `GET /api/catalog/categories` is already a
 * nested tree (the backend assembles it server-side from a flat query), not a flat list the frontend
 * has to build itself. Backend prunes inactive categories (and their entire subtree) before this ever
 * reaches the client, so every node here is implicitly `isActive: true` — the field is still exposed
 * because the same DTO shape backs the (not-yet-built) admin tree, which does need it.
 */
export interface CategoryTreeNode {
  readonly id: string;
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly iconKey: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly children: readonly CategoryTreeNode[];
}
