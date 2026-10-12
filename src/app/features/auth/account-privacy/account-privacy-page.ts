import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Modal } from '../../../shared/modal/modal';
import { Spinner } from '../../../shared/spinner/spinner';
import { ToastService } from '../../../shared/toast/toast.service';
import { AuthApiService } from '../data/auth-api.service';

@Component({
  selector: 'app-account-privacy-page',
  imports: [FormsModule, Modal, Spinner, TranslatePipe],
  templateUrl: './account-privacy-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPrivacyPage {
  private readonly authApi = inject(AuthApiService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);

  readonly isExporting = signal(false);
  readonly isDeleting = signal(false);
  readonly showDeleteModal = signal(false);

  deletePassword = '';
  deleteConfirmation = '';
  readonly deleteError = signal<string | null>(null);

  constructor() {
    setPageMeta({
      title: `${this.translation.t('auth.accountPrivacy.pageTitle')} · ${this.translation.t('common.appName')}`,
      description: this.translation.t('auth.accountPrivacy.pageDescription'),
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
        this.toast.success(this.translation.t('auth.accountPrivacy.export.success'));
      },
      error: (err: ApiError) => {
        this.isExporting.set(false);
        this.toast.error(err.message || this.translation.t('auth.accountPrivacy.export.error'));
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
      this.deleteError.set(this.translation.t('auth.accountPrivacy.deleteModal.confirmRequired'));
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
        this.toast.success(res.message || this.translation.t('auth.accountPrivacy.deleteModal.success'));
        this.authService.clearSession();
        this.router.navigate(['/']);
      },
      error: (err: ApiError) => {
        this.isDeleting.set(false);
        this.deleteError.set(err.message || this.translation.t('auth.accountPrivacy.deleteModal.error'));
      },
    });
  }
}
