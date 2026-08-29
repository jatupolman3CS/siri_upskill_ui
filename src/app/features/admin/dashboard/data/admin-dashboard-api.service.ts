import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AdminDashboardSummaryResponse } from './admin-dashboard-api.models';

@Injectable({ providedIn: 'root' })
export class AdminDashboardApiService {
  private readonly http = inject(HttpClient);

  getDashboardSummary(): Observable<AdminDashboardSummaryResponse> {
    return this.http.get<AdminDashboardSummaryResponse>('/api/analytics/admin/dashboard/summary');
  }
}
