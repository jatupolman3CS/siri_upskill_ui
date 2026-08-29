import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { PagedResult } from '../../../core/http/paged-result.model';
import {
  ContactMessageItem,
  SubmitContactMessageRequest,
  SubmitContactMessageResponse,
} from './contact-api.models';

@Injectable({ providedIn: 'root' })
export class ContactApiService extends ApiService {
  submitContactMessage(req: SubmitContactMessageRequest): Observable<SubmitContactMessageResponse> {
    return this.post<SubmitContactMessageResponse>('/contact', req);
  }

  getAdminContactMessages(page = 1, pageSize = 20, status?: string): Observable<PagedResult<ContactMessageItem>> {
    return this.get<PagedResult<ContactMessageItem>>('/admin/contact-messages', { page, pageSize, status });
  }

  resolveContactMessage(id: string, adminNotes?: string): Observable<{ success: boolean }> {
    return this.post<{ success: boolean }>(`/admin/contact-messages/${id}/resolve`, { adminNotes });
  }
}
