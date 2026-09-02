import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import { PagedResult } from '../../../core/http/paged-result.model';
import {
  LearningPathDetail,
  LearningPathSummary,
} from './learning-path-api.models';

@Injectable({ providedIn: 'root' })
export class LearningPathApiService extends ApiService {
  getLearningPaths(page = 1, pageSize = 20): Observable<PagedResult<LearningPathSummary> | LearningPathSummary[]> {
    return this.get<PagedResult<LearningPathSummary> | LearningPathSummary[]>('/catalog/learning-paths', {
      page,
      pageSize,
    });
  }

  getLearningPathBySlug(slug: string): Observable<LearningPathDetail> {
    return this.get<LearningPathDetail>(`/catalog/learning-paths/${encodeURIComponent(slug)}`);
  }
}
