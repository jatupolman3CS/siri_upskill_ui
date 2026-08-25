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
  phosphorUserPlus,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import {
  AdminAuditLogSummary,
  AdminUserSummary,
} from './data/admin-users-api.models';
import { AdminUsersApiService } from './data/admin-users-api.service';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-admin-users-page',
  imports: [CommonModule, FormsModule, NgIcon],
  templateUrl: './admin-users-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorMagnifyingGlass,
      phosphorUserPlus,
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
      title: 'จัดการผู้ใช้งานและสิทธิ์ | SIRI UpSkill Admin',
      description: 'ระบบจัดการผู้ใช้งาน สิทธิ์การเข้าถึง และบันทึก Audit Logs',
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
          this.users.set([...res.items]);
          this.totalUsers.set(res.totalCount);
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
          this.auditLogs.set([...res.items]);
          this.totalAuditLogs.set(res.totalCount);
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
        this.showMessage('success', `อัปเดตบทบาทของ ${user.displayName} เป็น ${newRole} สำเร็จ`);
        this.loadUsers();
        this.loadAuditLogs();
      },
      error: () => {
        this.isSavingRole.set(false);
        this.showMessage('error', 'เกิดข้อผิดพลาดในการอัปเดตบทบาท');
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

    const reason = this.suspendReason().trim() || 'ระงับโดยผู้ดูแลระบบ';
    this.isSubmittingSuspend.set(true);

    this.adminUsersApi.suspendUser(user.id, { reason }).subscribe({
      next: () => {
        this.isSubmittingSuspend.set(false);
        this.closeSuspendModal();
        this.showMessage('success', `ระงับการใช้งานบัญชี ${user.displayName} เรียบร้อยแล้ว`);
        this.loadUsers();
        this.loadAuditLogs();
      },
      error: () => {
        this.isSubmittingSuspend.set(false);
        this.showMessage('error', 'เกิดข้อผิดพลาดในการระงับบัญชี');
      },
    });
  }

  protected reactivateUser(user: AdminUserSummary): void {
    this.adminUsersApi.reactivateUser(user.id).subscribe({
      next: () => {
        this.showMessage('success', `คืนสิทธิ์การใช้งานบัญชี ${user.displayName} เรียบร้อยแล้ว`);
        this.loadUsers();
        this.loadAuditLogs();
      },
      error: () => {
        this.showMessage('error', 'เกิดข้อผิดพลาดในการคืนสิทธิ์การใช้งาน');
      },
    });
  }

  private showMessage(type: 'success' | 'error', text: string): void {
    this.actionMessage.set({ type, text });
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
