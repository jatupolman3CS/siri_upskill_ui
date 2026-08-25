export interface AnnouncementResponse {
  readonly id: string;
  readonly courseId: string;
  readonly instructorId: string;
  readonly title: string;
  readonly body: string;
  readonly sendEmail: boolean;
  readonly scheduledAtUtc?: string | null;
  readonly sentAtUtc?: string | null;
  readonly recipientCount: number;
  readonly createdAtUtc: string;
}

export interface CreateAnnouncementRequest {
  readonly courseId: string;
  readonly title: string;
  readonly body: string;
  readonly sendEmail?: boolean;
  readonly scheduledAtUtc?: string | null;
}

export interface UserNotificationResponse {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly linkUrl?: string | null;
  readonly isRead: boolean;
  readonly createdAtUtc: string;
}
