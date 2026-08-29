import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import {
  LearningPathDetail,
  LearningPathSummary,
} from './learning-path-api.models';

@Injectable({ providedIn: 'root' })
export class LearningPathApiService extends ApiService {
  getLearningPaths(): Observable<LearningPathSummary[]> {
    return this.get<LearningPathSummary[]>('/catalog/learning-paths');
  }

  getLearningPathBySlug(slug: string): Observable<LearningPathDetail> {
    return this.get<LearningPathDetail>(`/catalog/learning-paths/${encodeURIComponent(slug)}`);
  }
}
