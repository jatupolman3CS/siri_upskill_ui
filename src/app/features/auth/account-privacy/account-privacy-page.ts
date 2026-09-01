import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Modal } from '../../../shared/modal/modal';
import { Spinner } from '../../../shared/spinner/spinner';
import { ToastService } from '../../../shared/toast/toast.service';
import { AuthApiService } from '../data/auth-api.service';

@Component({
  selector: 'app-account-privacy-page',
  imports: [FormsModule, Modal, Spinner],
  templateUrl: './account-privacy-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPrivacyPage {
  private readonly authApi = inject(AuthApiService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly isExporting = signal(false);
  readonly isDeleting = signal(false);
  readonly showDeleteModal = signal(false);

  deletePassword = '';
  deleteConfirmation = '';
  readonly deleteError = signal<string | null>(null);

  constructor() {
    setPageMeta({
      title: 'ความเป็นส่วนตัวและการจัดการข้อมูล (PDPA) | SiriUpSkill',
      description: 'ส่งออกข้อมูลส่วนบุคคล หรือลบบัญชีผู้ใช้งานตามสิทธิ์คุ้มครองข้อมูลส่วนบุคคล (PDPA)',
    });
  }

  exportData(): void {
    if (this.isExporting()) return;
    this.isExporting.set(true);

    this.authApi.exportData().subscribe({
      next: (data) => {
        this.isExporting.set(false);
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `siriupskill-my-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success('ดาวน์โหลดข้อมูลส่วนบุคคลของคุณเรียบร้อยแล้ว');
      },
      error: (err: ApiError) => {
        this.isExporting.set(false);
        this.toast.error(err.message || 'ไม่สามารถส่งออกข้อมูลได้ในขณะนี้');
      },
    });
  }

  openDeleteModal(): void {
    this.deletePassword = '';
    this.deleteConfirmation = '';
    this.deleteError.set(null);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    if (this.deleteConfirmation.trim().toUpperCase() !== 'DELETE') {
      this.deleteError.set('กรุณาพิมพ์คำว่า DELETE เพื่อยืนยัน');
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set(null);

    this.authApi.anonymizeAccount({
      password: this.deletePassword,
      confirmation: this.deleteConfirmation.trim().toUpperCase(),
    }).subscribe({
      next: (res) => {
        this.isDeleting.set(false);
        this.showDeleteModal.set(false);
        this.toast.success(res.message || 'บัญชีของคุณถูกลบและทำให้นิรนามเรียบร้อยแล้ว');
        this.authService.clearSession();
        this.router.navigate(['/']);
      },
      error: (err: ApiError) => {
        this.isDeleting.set(false);
        this.deleteError.set(err.message || 'เกิดข้อผิดพลาดในการลบบัญชี');
      },
    });
  }
}
