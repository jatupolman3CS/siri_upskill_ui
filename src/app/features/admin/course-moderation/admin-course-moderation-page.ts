import { CommonModule, CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCheckCircle,
  phosphorClock,
  phosphorEye,
  phosphorGraduationCap,
  phosphorUser,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { PendingCourseReviewSummary } from './data/admin-moderation-api.models';
import { AdminModerationApiService } from './data/admin-moderation-api.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-admin-course-moderation-page',
  imports: [CommonModule, FormsModule, RouterLink, NgIcon, CurrencyThbPipe, TranslatePipe, Spinner],
  templateUrl: './admin-course-moderation-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
    provideIcons({
      phosphorCheckCircle,
      phosphorXCircle,
      phosphorEye,
      phosphorGraduationCap,
      phosphorClock,
      phosphorUser,
    }),
  ],
})
export class AdminCourseModerationPage implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly moderationApi = inject(AdminModerationApiService);

  protected readonly isLoading = signal(false);
  protected readonly pendingCourses = signal<PendingCourseReviewSummary[]>([]);
  protected readonly totalCount = signal(0);

  // Reject Modal State
  protected readonly rejectingCourse = signal<PendingCourseReviewSummary | null>(null);
  protected readonly rejectionReason = signal('');
  protected readonly isSubmittingReject = signal(false);

  // Action status message
  protected readonly actionMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  ngOnInit(): void {
    this.seoService.set({
      title: 'คิวอนุมัติคอร์สเรียน | SIRI UpSkill Admin',
      description: 'ระบบตรวจสอบและอนุมัติคอร์สเรียนใหม่ก่อนเผยแพร่',
      path: '/admin/courses',
      robots: 'noindex',
    });

    this.loadPendingCourses();
  }

  protected loadPendingCourses(): void {
    this.isLoading.set(true);
    this.moderationApi.getPendingCourses(1, 50).subscribe({
      next: (res) => {
        this.pendingCourses.set([...res.items]);
        this.totalCount.set(res.totalCount);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  protected approveCourse(course: PendingCourseReviewSummary): void {
    this.moderationApi.approveCourse(course.id).subscribe({
      next: () => {
        this.showMessage('success', `อนุมัติและเผยแพร่คอร์ส "${course.title}" เรียบร้อยแล้ว`);
        this.loadPendingCourses();
      },
      error: () => {
        this.showMessage('error', 'เกิดข้อผิดพลาดในการอนุมัติคอร์ส');
      },
    });
  }

  protected openRejectModal(course: PendingCourseReviewSummary): void {
    this.rejectingCourse.set(course);
    this.rejectionReason.set('');
  }

  protected closeRejectModal(): void {
    this.rejectingCourse.set(null);
  }

  protected confirmReject(): void {
    const course = this.rejectingCourse();
    if (!course) return;

    const reason = this.rejectionReason().trim();
    if (!reason) {
      this.showMessage('error', 'กรุณาระบุเหตุผลในการส่งกลับแก้ไข');
      return;
    }

    this.isSubmittingReject.set(true);
    this.moderationApi.rejectCourse(course.id, { reason }).subscribe({
      next: () => {
        this.isSubmittingReject.set(false);
        this.closeRejectModal();
        this.showMessage('success', `ส่งกลับคอร์ส "${course.title}" เพื่อแก้ไขเรียบร้อยแล้ว`);
        this.loadPendingCourses();
      },
      error: () => {
        this.isSubmittingReject.set(false);
        this.showMessage('error', 'เกิดข้อผิดพลาดในการส่งกลับคอร์ส');
      },
    });
  }

  private showMessage(type: 'success' | 'error', text: string): void {
    this.actionMessage.set({ type, text });
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
