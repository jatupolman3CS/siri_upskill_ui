import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../../core/http/api.service';
import { CategoryTreeNode } from '../../../catalog/data/category-api.models';
import {
  CategoryResponse,
  CreateCategoryRequest,
  ReorderCategoriesRequest,
  UpdateCategoryRequest,
} from './admin-category-api.models';

/**
 * `*ApiService` for the AdminOnly category endpoints (`CategoriesController`). Components never call `HttpClient`
 * directly (frontend.md). Unlike the public `GET /catalog/categories`, the admin tree is not cached server-side, so an
 * admin sees their own writes on the very next read.
 */
@Injectable({ providedIn: 'root' })
export class AdminCategoryApiService extends ApiService {
  /** Whole tree INCLUDING inactive categories. */
  getTree(): Observable<readonly CategoryTreeNode[]> {
    return this.get<readonly CategoryTreeNode[]>('/catalog/admin/categories');
  }

  create(request: CreateCategoryRequest): Observable<CategoryResponse> {
    return this.post<CategoryResponse>('/catalog/admin/categories', request);
  }

  update(id: string, request: UpdateCategoryRequest): Observable<CategoryResponse> {
    return this.put<CategoryResponse>(`/catalog/admin/categories/${encodeURIComponent(id)}`, request);
  }

  /** `PUT /categories/reorder` — the body must list every sibling of one parent. Responds 200 with an empty body. */
  reorder(request: ReorderCategoriesRequest): Observable<void> {
    return this.put<void>('/catalog/admin/categories/reorder', request);
  }

  /** Hard delete; 204 on success. The server answers 409 while the category still has children. */
  remove(id: string): Observable<void> {
    return this.delete<void>(`/catalog/admin/categories/${encodeURIComponent(id)}`);
  }
}
