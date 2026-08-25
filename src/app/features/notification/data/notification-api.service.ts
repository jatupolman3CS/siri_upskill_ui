import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/http/api.service';
import {
  AnnouncementResponse,
  CreateAnnouncementRequest,
  UserNotificationResponse,
} from './notification-api.models';

@Injectable({ providedIn: 'root' })
export class NotificationApiService extends ApiService {
  createAnnouncement(req: CreateAnnouncementRequest): Observable<AnnouncementResponse> {
    return this.post<AnnouncementResponse>('/notifications/announcements', req);
  }

  getCourseAnnouncements(courseId: string): Observable<readonly AnnouncementResponse[]> {
    return this.get<readonly AnnouncementResponse[]>(`/notifications/announcements/course/${courseId}`);
  }

  getInstructorAnnouncements(): Observable<readonly AnnouncementResponse[]> {
    return this.get<readonly AnnouncementResponse[]>('/notifications/instructor/announcements');
  }

  getMyNotifications(): Observable<readonly UserNotificationResponse[]> {
    return this.get<readonly UserNotificationResponse[]>('/notifications/my');
  }

  markNotificationRead(notificationId: string): Observable<void> {
    return this.post<void>(`/notifications/${notificationId}/read`, {});
  }
}
