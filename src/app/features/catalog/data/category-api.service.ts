import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import { CategoryTreeNode } from './category-api.models';

/**
 * The one `*ApiService` for `/api/catalog/categories` (P1-20/P1-01) — components never call
 * `HttpClient` directly (frontend.md). `GET /categories` is `.AllowAnonymous()`
 * (`CatalogModule.MapCatalogEndpoints`) and Redis-cached server-side for an hour, so this is safe to
 * call on every page load without its own client-side cache.
 */
@Injectable({ providedIn: 'root' })
export class CategoryApiService extends ApiService {
  getCategoryTree(): Observable<readonly CategoryTreeNode[]> {
    return this.get<readonly CategoryTreeNode[]>('/catalog/categories');
  }
}
