import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCalendar,
  phosphorCheckCircle,
  phosphorMegaphone,
  phosphorPaperPlaneTilt,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { CourseApiService } from '../../catalog/data/course-api.service';
import { SeoService } from '../../../core/seo/seo.service';
import { NotificationApiService } from '../../notification/data/notification-api.service';
import { Spinner } from '../../../shared/spinner/spinner';

export interface AnnouncementHistoryItem {
  id: string;
  courseTitle: string;
  title: string;
  message: string;
  sentAtUtc: string;
  recipientsCount: number;
  isEmailSent: boolean;
}

@Component({
  selector: 'app-instructor-announcements-page',
  imports: [CommonModule, FormsModule, NgIcon, Spinner],
  templateUrl: './instructor-announcements-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorMegaphone,
      phosphorPaperPlaneTilt,
      phosphorCheckCircle,
      phosphorUsers,
      phosphorCalendar,
    }),
  ],
})
export class InstructorAnnouncementsPage implements OnInit {
  private readonly notificationApi = inject(NotificationApiService);
  private readonly courseApi = inject(CourseApiService);
  private readonly seoService = inject(SeoService);

  protected readonly courses = signal<{ id: string; title: string; studentsCount?: number }[]>([]);
  protected readonly isLoadingCourses = signal(false);

  protected readonly selectedCourseId = signal('');
  protected readonly announcementTitle = signal('');
  protected readonly announcementMessage = signal('');
  protected readonly sendEmailNotification = signal(true);

  protected readonly isSending = signal(false);
  protected readonly sendSuccess = signal(false);

  protected readonly announcements = signal<AnnouncementHistoryItem[]>([]);

  ngOnInit(): void {
    this.seoService.set({
      title: 'ส่งประกาศถึงผู้เรียน | Instructor Studio',
      description: 'ระบบส่งข้อความประกาศและอีเมลแจ้งเตือนถึงผู้เรียนในคอร์ส',
      path: '/instructor/announcements',
      robots: 'noindex',
    });

    this.isLoadingCourses.set(true);
    this.courseApi.getMyCourses(1, 100).subscribe({
      next: (res) => {
        this.isLoadingCourses.set(false);
        if (res.items && res.items.length > 0) {
          this.courses.set(res.items.map((c) => ({ id: c.id, title: c.title })));
          this.selectedCourseId.set(res.items[0].id);
        }
      },
      error: () => {
        this.isLoadingCourses.set(false);
      },
    });

    this.notificationApi.getInstructorAnnouncements().subscribe({
      next: (res) => {
        if (res && res.length > 0) {
          this.announcements.set(
            res.map((item) => ({
              id: item.id,
              courseTitle: 'คอร์สของฉัน',
              title: item.title,
              message: item.body,
              sentAtUtc: item.sentAtUtc ?? item.createdAtUtc,
              recipientsCount: item.recipientCount,
              isEmailSent: item.sendEmail,
            }))
          );
        }
      },
      error: () => {
        // Intentional no-op: announcement history is optional context, so
        // keep the announcements signal at its empty default on failure.
      },
    });
  }

  protected sendAnnouncement(): void {
    const title = this.announcementTitle().trim();
    const msg = this.announcementMessage().trim();
    if (!title || !msg) return;

    this.isSending.set(true);
    this.notificationApi
      .createAnnouncement({
        courseId: this.selectedCourseId(),
        title,
        body: msg,
        sendEmail: this.sendEmailNotification(),
      })
      .subscribe({
        next: (created) => {
          const course = this.courses().find((c) => c.id === this.selectedCourseId());
          const newAnn: AnnouncementHistoryItem = {
            id: created.id,
            courseTitle: course?.title ?? 'คอร์สเรียน',
            title: created.title,
            message: created.body,
            sentAtUtc: created.sentAtUtc ?? created.createdAtUtc,
            recipientsCount: created.recipientCount,
            isEmailSent: created.sendEmail,
          };

          this.announcements.update((list) => [newAnn, ...list]);
          this.announcementTitle.set('');
          this.announcementMessage.set('');
          this.isSending.set(false);
          this.sendSuccess.set(true);
          setTimeout(() => this.sendSuccess.set(false), 3000);
        },
        error: () => {
          this.isSending.set(false);
        },
      });
  }
}
