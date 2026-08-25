import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  GetAdminAuditLogsResponse,
  GetAdminUsersResponse,
  SuspendUserRequest,
  UpdateUserRolesRequest,
} from './admin-users-api.models';

@Injectable({ providedIn: 'root' })
export class AdminUsersApiService {
  private readonly http = inject(HttpClient);

  getUsers(options: {
    query?: string;
    role?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Observable<GetAdminUsersResponse> {
    let params = new HttpParams();
    if (options.query) params = params.set('query', options.query);
    if (options.role && options.role !== 'All') params = params.set('role', options.role);
    if (options.status && options.status !== 'All') params = params.set('status', options.status);
    params = params.set('page', options.page ?? 1);
    params = params.set('pageSize', options.pageSize ?? 20);

    return this.http.get<GetAdminUsersResponse>('/api/identity/admin/users', { params });
  }

  suspendUser(userId: string, request: SuspendUserRequest): Observable<void> {
    return this.http.post<void>(`/api/identity/admin/users/${userId}/suspend`, request);
  }

  reactivateUser(userId: string): Observable<void> {
    return this.http.post<void>(`/api/identity/admin/users/${userId}/reactivate`, {});
  }

  updateUserRoles(userId: string, request: UpdateUserRolesRequest): Observable<void> {
    return this.http.put<void>(`/api/identity/admin/users/${userId}/roles`, request);
  }

  getAuditLogs(options: {
    userId?: string;
    eventType?: string;
    page?: number;
    pageSize?: number;
  }): Observable<GetAdminAuditLogsResponse> {
    let params = new HttpParams();
    if (options.userId) params = params.set('userId', options.userId);
    if (options.eventType) params = params.set('eventType', options.eventType);
    params = params.set('page', options.page ?? 1);
    params = params.set('pageSize', options.pageSize ?? 30);

    return this.http.get<GetAdminAuditLogsResponse>('/api/identity/admin/audit-logs', { params });
  }
}
