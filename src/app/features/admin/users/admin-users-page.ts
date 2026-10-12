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
  phosphorCheckCircle,
  phosphorClockCounterClockwise,
  phosphorLockKey,
  phosphorMagnifyingGlass,
  phosphorPencilSimple,
  phosphorShieldCheck,
  phosphorShieldWarning,
  phosphorUser,
  phosphorUserPlus,
  phosphorUsers,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import {
  AdminAuditLogSummary,
  AdminUserSummary,
} from './data/admin-users-api.models';
import { AdminUsersApiService } from './data/admin-users-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Modal } from '../../../shared/modal/modal';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-admin-users-page',
  imports: [CommonModule, FormsModule, NgIcon, TranslatePipe, Modal, Spinner],
  templateUrl: './admin-users-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorUsers,
      phosphorUser,
      phosphorUserPlus,
      phosphorMagnifyingGlass,
      phosphorShieldCheck,
      phosphorShieldWarning,
      phosphorLockKey,
      phosphorClockCounterClockwise,
      phosphorCheckCircle,
      phosphorPencilSimple,
      phosphorXCircle,
    }),
  ],
})
export class AdminUsersPage implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly translation = inject(TranslationService);
  private readonly adminUsersApi = inject(AdminUsersApiService);

  protected readonly activeTab = signal<'users' | 'audit'>('users');
  protected readonly searchQuery = signal('');
  protected readonly selectedRole = signal<string>('All');
  protected readonly selectedStatus = signal<string>('All');

  protected readonly isLoadingUsers = signal(false);
  protected readonly isLoadingAudit = signal(false);
  protected readonly users = signal<AdminUserSummary[]>([]);
  protected readonly totalUsers = signal(0);
  protected readonly auditLogs = signal<AdminAuditLogSummary[]>([]);
  protected readonly totalAuditLogs = signal(0);

  // Invite Modal State
  protected readonly showInviteModal = signal(false);
  protected readonly inviteEmail = signal('');
  protected readonly inviteDisplayName = signal('');
  protected readonly inviteRole = signal('Learner');
  protected readonly isSubmittingInvite = signal(false);

  // Edit Role Modal State
  protected readonly editingUser = signal<AdminUserSummary | null>(null);
  protected readonly editRoleSelected = signal<string>('Learner');
  protected readonly isSavingRole = signal(false);

  // Suspend Modal State
  protected readonly suspendingUser = signal<AdminUserSummary | null>(null);
  protected readonly suspendReason = signal('');
  protected readonly isSubmittingSuspend = signal(false);

  // Notification / Feedback State
  protected readonly actionMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  ngOnInit(): void {
    this.seoService.set({
      title: this.translation.t('admin.users.seoTitle'),
      description: this.translation.t('admin.users.seoDescription'),
      path: '/admin/users',
      robots: 'noindex',
    });

    this.loadUsers();
    this.loadAuditLogs();
  }

  protected loadUsers(): void {
    this.isLoadingUsers.set(true);
    this.adminUsersApi
      .getUsers({
        query: this.searchQuery(),
        role: this.selectedRole(),
        status: this.selectedStatus(),
        page: 1,
        pageSize: 50,
      })
      .subscribe({
        next: (res) => {
          const items = Array.isArray(res) ? res : (res?.items ?? []);
          this.users.set([...items]);
          this.totalUsers.set(res?.totalCount ?? items.length);
          this.isLoadingUsers.set(false);
        },
        error: () => {
          this.isLoadingUsers.set(false);
        },
      });
  }

  protected loadAuditLogs(): void {
    this.isLoadingAudit.set(true);
    this.adminUsersApi
      .getAuditLogs({
        page: 1,
        pageSize: 50,
      })
      .subscribe({
        next: (res) => {
          const items = Array.isArray(res) ? res : (res?.items ?? []);
          this.auditLogs.set([...items]);
          this.totalAuditLogs.set(res?.totalCount ?? items.length);
          this.isLoadingAudit.set(false);
        },
        error: () => {
          this.isLoadingAudit.set(false);
        },
      });
  }

  protected onSearch(): void {
    this.loadUsers();
  }

  protected openInviteModal(): void {
    this.inviteEmail.set('');
    this.inviteDisplayName.set('');
    this.inviteRole.set('Learner');
    this.showInviteModal.set(true);
  }

  protected closeInviteModal(): void {
    this.showInviteModal.set(false);
  }

  protected submitInvite(): void {
    const email = this.inviteEmail().trim();
    const displayName = this.inviteDisplayName().trim();
    const role = this.inviteRole();

    if (!email || !displayName) return;

    this.isSubmittingInvite.set(true);
    this.adminUsersApi
      .inviteUser({
        email,
        displayName,
        role,
      })
      .subscribe({
        next: (res) => {
          this.isSubmittingInvite.set(false);
          this.closeInviteModal();
          this.showMessage('success', this.translation.t('admin.users.messages.inviteSuccess', { email: res.email }));
          this.loadUsers();
          this.loadAuditLogs();
        },
        error: (err) => {
          this.isSubmittingInvite.set(false);
          this.showMessage('error', err?.error?.detail || this.translation.t('admin.users.messages.inviteError'));
        },
      });
  }

  protected openEditRoleModal(user: AdminUserSummary): void {
    this.editingUser.set(user);
    this.editRoleSelected.set(user.roles[0] ?? 'Learner');
  }

  protected closeEditRoleModal(): void {
    this.editingUser.set(null);
  }

  protected saveUserRole(): void {
    const user = this.editingUser();
    if (!user) return;

    this.isSavingRole.set(true);
    const newRole = this.editRoleSelected();

    this.adminUsersApi.updateUserRoles(user.id, { roles: [newRole] }).subscribe({
      next: () => {
        this.isSavingRole.set(false);
        this.closeEditRoleModal();
        this.showMessage(
          'success',
          this.translation.t('admin.users.messages.roleUpdated', { name: user.displayName, role: newRole }),
        );
        this.loadUsers();
        this.loadAuditLogs();
      },
      error: () => {
        this.isSavingRole.set(false);
        this.showMessage('error', this.translation.t('admin.users.messages.roleUpdateError'));
      },
    });
  }

  protected openSuspendModal(user: AdminUserSummary): void {
    this.suspendingUser.set(user);
    this.suspendReason.set('');
  }

  protected closeSuspendModal(): void {
    this.suspendingUser.set(null);
  }

  protected confirmSuspend(): void {
    const user = this.suspendingUser();
    if (!user) return;

    const reason = this.suspendReason().trim() || this.translation.t('admin.users.messages.defaultSuspendReason');
    this.isSubmittingSuspend.set(true);

    this.adminUsersApi.suspendUser(user.id, { reason }).subscribe({
      next: () => {
        this.isSubmittingSuspend.set(false);
        this.closeSuspendModal();
        this.showMessage('success', this.translation.t('admin.users.messages.suspended', { name: user.displayName }));
        this.loadUsers();
        this.loadAuditLogs();
      },
      error: () => {
        this.isSubmittingSuspend.set(false);
        this.showMessage('error', this.translation.t('admin.users.messages.suspendError'));
      },
    });
  }

  protected reactivateUser(user: AdminUserSummary): void {
    this.adminUsersApi.reactivateUser(user.id).subscribe({
      next: () => {
        this.showMessage('success', this.translation.t('admin.users.messages.reactivated', { name: user.displayName }));
        this.loadUsers();
        this.loadAuditLogs();
      },
      error: () => {
        this.showMessage('error', this.translation.t('admin.users.messages.reactivateError'));
      },
    });
  }

  private showMessage(type: 'success' | 'error', text: string): void {
    this.actionMessage.set({ type, text });
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
