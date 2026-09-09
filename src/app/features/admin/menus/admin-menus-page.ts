import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowsDownUp,
  phosphorCheckCircle,
  phosphorCompass,
  phosphorLink,
  phosphorList,
  phosphorPencilSimple,
  phosphorPlus,
  phosphorTrash,
  phosphorXCircle,
} from '@ng-icons/phosphor-icons/regular';

import { MenuItem } from '../../cms/data/cms-api.models';
import { CmsApiService } from '../../cms/data/cms-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-admin-menus-page',
  imports: [CommonModule, FormsModule, NgIcon, TranslatePipe, Spinner],
  templateUrl: './admin-menus-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorPlus,
      phosphorTrash,
      phosphorPencilSimple,
      phosphorLink,
      phosphorList,
      phosphorCompass,
      phosphorArrowsDownUp,
      phosphorCheckCircle,
      phosphorXCircle,
    }),
  ],
})
export class AdminMenusPage implements OnInit {
  private readonly cmsApi = inject(CmsApiService);
  private readonly seoService = inject(SeoService);

  protected readonly menuItems = signal<MenuItem[]>([]);
  protected readonly isLoading = signal(false);

  // Add / Edit Modal State
  protected readonly showModal = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly currentId = signal<string | null>(null);

  protected readonly formLabel = signal('');
  protected readonly formUrl = signal('');
  protected readonly formParentId = signal<string | null>(null);
  protected readonly formSortOrder = signal(1);
  protected readonly formIsActive = signal(true);
  protected readonly isSaving = signal(false);

  // Notification / Feedback State
  protected readonly actionMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  protected readonly topLevelMenuItems = computed(() =>
    this.menuItems().filter((item) => !item.parentId)
  );

  ngOnInit(): void {
    this.seoService.set({
      title: 'จัดการเมนูนำทาง | SIRI UpSkill Admin',
      description: 'ระบบจัดการโครงสร้างเมนูหลักและเมนูย่อยของเว็บไซต์',
      path: '/admin/menus',
      robots: 'noindex',
    });

    this.loadMenuItems();
  }

  protected loadMenuItems(): void {
    this.isLoading.set(true);
    this.cmsApi.getAdminMenuItems().subscribe({
      next: (items) => {
        const list = items;
        this.menuItems.set(
          [...list].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        );
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  protected openAddModal(): void {
    this.isEditing.set(false);
    this.currentId.set(null);
    this.formLabel.set('');
    this.formUrl.set('/');
    this.formParentId.set(null);
    this.formSortOrder.set(this.menuItems().length + 1);
    this.formIsActive.set(true);
    this.showModal.set(true);
  }

  protected openEditModal(item: MenuItem): void {
    this.isEditing.set(true);
    this.currentId.set(item.id);
    this.formLabel.set(item.label);
    this.formUrl.set(item.url);
    this.formParentId.set(item.parentId);
    this.formSortOrder.set(item.sortOrder);
    this.formIsActive.set(item.isActive);
    this.showModal.set(true);
  }

  protected closeModal(): void {
    this.showModal.set(false);
  }

  protected saveMenuItem(): void {
    const label = this.formLabel().trim();
    const url = this.formUrl().trim();
    if (!label || !url) return;

    this.isSaving.set(true);
    const parentId = this.formParentId() || null;
    const sortOrder = Number(this.formSortOrder()) || 0;
    const isActive = this.formIsActive();

    if (this.isEditing() && this.currentId()) {
      const id = this.currentId()!;
      this.cmsApi
        .updateMenuItem(id, {
          label,
          url,
          parentId,
          sortOrder,
          isActive,
        })
        .subscribe({
          next: () => {
            this.isSaving.set(false);
            this.closeModal();
            this.showMessage('success', `อัปเดตเมนู "${label}" สำเร็จ`);
            this.loadMenuItems();
          },
          error: () => {
            this.isSaving.set(false);
            this.showMessage('error', 'เกิดข้อผิดพลาดในการบันทึกเมนู');
          },
        });
    } else {
      this.cmsApi
        .createMenuItem({
          label,
          url,
          parentId,
          sortOrder,
          isActive,
        })
        .subscribe({
          next: () => {
            this.isSaving.set(false);
            this.closeModal();
            this.showMessage('success', `เพิ่มเมนู "${label}" เรียบร้อยแล้ว`);
            this.loadMenuItems();
          },
          error: () => {
            this.isSaving.set(false);
            this.showMessage('error', 'เกิดข้อผิดพลาดในการสร้างเมนู');
          },
        });
    }
  }

  protected toggleActive(item: MenuItem): void {
    const updatedStatus = !item.isActive;
    this.menuItems.update((list) =>
      list.map((m) => (m.id === item.id ? { ...m, isActive: updatedStatus } : m))
    );

    this.cmsApi
      .updateMenuItem(item.id, {
        label: item.label,
        url: item.url,
        parentId: item.parentId,
        sortOrder: item.sortOrder,
        isActive: updatedStatus,
      })
      .subscribe({
        error: () => {
          // Revert
          this.menuItems.update((list) =>
            list.map((m) => (m.id === item.id ? { ...m, isActive: item.isActive } : m))
          );
        },
      });
  }

  protected deleteMenuItem(item: MenuItem): void {
    if (!confirm(`คุณต้องการลบเมนู "${item.label}" ใช่หรือไม่?`)) return;

    this.cmsApi.deleteMenuItem(item.id).subscribe({
      next: () => {
        this.showMessage('success', `ลบเมนู "${item.label}" เรียบร้อยแล้ว`);
        this.loadMenuItems();
      },
      error: () => {
        this.showMessage('error', 'ไม่สามารถลบเมนูได้ (อาจมีเมนูย่อยผูกอยู่)');
      },
    });
  }

  protected getParentLabel(parentId: string | null): string {
    if (!parentId) return '-';
    const parent = this.menuItems().find((m) => m.id === parentId);
    return parent ? parent.label : '-';
  }

  private showMessage(type: 'success' | 'error', text: string): void {
    this.actionMessage.set({ type, text });
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
