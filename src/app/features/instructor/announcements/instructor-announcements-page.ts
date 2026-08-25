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

import { SeoService } from '../../../core/seo/seo.service';
import { NotificationApiService } from '../../notification/data/notification-api.service';

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
  imports: [CommonModule, FormsModule, NgIcon],
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
  private readonly seoService = inject(SeoService);

  protected readonly courses = signal([
    { id: 'c-1', title: 'Full-Stack Web Development with Angular & .NET 10', studentsCount: 420 },
    { id: 'c-2', title: 'Building Production AI Agents with Semantic Kernel', studentsCount: 185 },
  ]);

  protected readonly selectedCourseId = signal('c-1');
  protected readonly announcementTitle = signal('');
  protected readonly announcementMessage = signal('');
  protected readonly sendEmailNotification = signal(true);

  protected readonly isSending = signal(false);
  protected readonly sendSuccess = signal(false);

  protected readonly announcements = signal<AnnouncementHistoryItem[]>([
    {
      id: 'ann-1',
      courseTitle: 'Full-Stack Web Development with Angular & .NET 10',
      title: 'อัปเดตบทเรียนใหม่: การจัดการ State ด้วย Angular 22 Signals',
      message: 'สวัสดีครับผู้เรียนทุกคน ตอนนี้อาจารย์ได้เพิ่มวิดีโอเนื้อหาใหม่ในหมวดที่ 3 แล้ว...',
      sentAtUtc: '2026-08-18T09:30:00Z',
      recipientsCount: 420,
      isEmailSent: true,
    },
    {
      id: 'ann-2',
      courseTitle: 'Full-Stack Web Development with Angular & .NET 10',
      title: 'แจ้งนัดหมาย Live Q&A ถาม-ตอบปัญหาประจำเดือน',
      message: 'ขอเชิญนักเรียนทุกคนเข้าร่วม Live Q&A วันเสาร์นี้เวลา 19.00 น....',
      sentAtUtc: '2026-08-10T14:00:00Z',
      recipientsCount: 390,
      isEmailSent: true,
    },
  ]);

  ngOnInit(): void {
    this.seoService.set({
      title: 'ส่งประกาศถึงผู้เรียน | Instructor Studio',
      description: 'ระบบส่งข้อความประกาศและอีเมลแจ้งเตือนถึงผู้เรียนในคอร์ส',
      path: '/instructor/announcements',
      robots: 'noindex',
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
      error: () => {},
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
