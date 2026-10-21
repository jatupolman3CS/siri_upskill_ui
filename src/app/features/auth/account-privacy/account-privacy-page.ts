import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Modal } from '../../../shared/modal/modal';
import { Spinner } from '../../../shared/spinner/spinner';
import { ToastService } from '../../../shared/toast/toast.service';
import { AuthApiService } from '../data/auth-api.service';

export interface ErasureBlocker {
  readonly code: string;
  readonly label: string;
  readonly link: string;
  readonly actionLabel: string;
}

const BLOCKER_ROUTES: Readonly<Record<string, string>> = {
  learner_bookings: '/my-tutoring',
  learner_refunds: '/my-tutoring',
  learner_packages: '/my-tutoring',
  learner_disputes: '/my-tutoring',
  tutor_sessions: '/instructor/tutoring/classes',
  tutor_bookings: '/instructor/tutoring/classes',
  tutor_disputes: '/instructor/tutoring/disputes',
  tutor_packages: '/instructor/tutoring/packages',
  tutor_payout_balance: '/instructor/tutoring/wallet',
};

const PRIVACY_PARTS = ['tutoring', 'learner', 'privacy'] as const;
const privacyKey = (...subkeys: readonly string[]) => [...PRIVACY_PARTS, ...subkeys].join('.');

@Component({
  selector: 'app-account-privacy-page',
  imports: [FormsModule, Modal, RouterLink, Spinner, TranslatePipe],
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
  readonly erasureBlockers = signal<readonly ErasureBlocker[]>([]);
  readonly erasureHeading = signal<string | null>(null);

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
    this.erasureBlockers.set([]);
    this.erasureHeading.set(null);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deleteError.set(null);
    this.erasureBlockers.set([]);
    this.erasureHeading.set(null);
  }

  confirmDelete(): void {
    if (this.deleteConfirmation.trim().toUpperCase() !== 'DELETE') {
      this.deleteError.set(this.translation.t('auth.accountPrivacy.deleteModal.confirmRequired'));
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set(null);
    this.erasureBlockers.set([]);
    this.erasureHeading.set(null);

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
        const details = (typeof err.details === 'object' && err.details !== null)
          ? (err.details as Record<string, unknown>)
          : undefined;
        const reason = (typeof details?.['reason'] === 'string' ? details['reason'] : undefined) ?? err.code;
        const rawBlockers = (Array.isArray(details?.['blockers']) ? (details['blockers'] as string[]) : undefined)
          ?? (Array.isArray((details?.['extensions'] as Record<string, unknown> | undefined)?.['blockers'])
            ? ((details!['extensions'] as Record<string, unknown>)['blockers'] as string[])
            : undefined)
          ?? [];

        if (err.status === 409 && reason === 'tutoring.erasure_blocked') {
          const blockersList = rawBlockers.length > 0 ? rawBlockers : ['generic'];
          const viewAction = this.translation.t(privacyKey('viewAction'));

          this.erasureHeading.set(this.translation.t(privacyKey('erasureBlockedHeading')));
          this.erasureBlockers.set(
            blockersList.map((code) => {
              const key = privacyKey('blockers', code);
              const translated = this.translation.t(key);
              return {
                code,
                label: translated !== key ? translated : this.translation.t(privacyKey('blockers', 'generic')),
                link: BLOCKER_ROUTES[code] ?? '/my-tutoring',
                actionLabel: viewAction,
              };
            }),
          );
        } else {
          this.deleteError.set(err.message || this.translation.t('auth.accountPrivacy.deleteModal.error'));
        }
      },
    });
  }
}
