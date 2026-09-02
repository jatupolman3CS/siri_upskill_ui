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
  phosphorImage,
  phosphorPencilSimple,
  phosphorPlus,
  phosphorTrash,
} from '@ng-icons/phosphor-icons/regular';

import { BannerItem } from '../../cms/data/cms-api.models';
import { CmsApiService } from '../../cms/data/cms-api.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-admin-banners-page',
  imports: [CommonModule, FormsModule, NgIcon, Spinner],
  templateUrl: './admin-banners-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorPlus,
      phosphorTrash,
      phosphorPencilSimple,
      phosphorImage,
      phosphorCheckCircle,
    }),
  ],
})
export class AdminBannersPage implements OnInit {
  private readonly cmsApi = inject(CmsApiService);
  private readonly seoService = inject(SeoService);

  protected readonly banners = signal<BannerItem[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly showAddForm = signal(false);
  protected readonly newTitle = signal('');
  protected readonly newImageUrl = signal('');
  protected readonly newTargetUrl = signal('');

  ngOnInit(): void {
    this.seoService.set({
      title: 'จัดการแบนเนอร์ | SIRI UpSkill Admin',
      description: 'ระบบจัดการภาพแบนเนอร์หน้าแรก',
      path: '/admin/banners',
      robots: 'noindex',
    });

    this.loadBanners();
  }

  protected loadBanners(): void {
    this.isLoading.set(true);
    this.cmsApi.getAdminBanners().subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.banners.set([...items]);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  protected toggleActive(banner: BannerItem): void {
    const updatedStatus = !banner.isActive;
    this.banners.update((list) =>
      list.map((b) => (b.id === banner.id ? { ...b, isActive: updatedStatus } : b))
    );
    this.cmsApi
      .updateBanner(banner.id, {
        title: banner.title,
        imageUrl: banner.imageUrl,
        targetUrl: banner.targetUrl,
        sortOrder: banner.sortOrder,
        isActive: updatedStatus,
      })
      .subscribe({
        error: () => {
          // Revert on error
          this.banners.update((list) =>
            list.map((b) => (b.id === banner.id ? { ...b, isActive: banner.isActive } : b))
          );
        },
      });
  }

  protected deleteBanner(id: string): void {
    this.banners.update((list) => list.filter((b) => b.id !== id));
    this.cmsApi.deleteBanner(id).subscribe({
      next: () => {
        this.loadBanners();
      },
      error: () => {
        this.loadBanners();
      },
    });
  }

  protected createBanner(): void {
    const title = this.newTitle().trim();
    const imageUrl = this.newImageUrl().trim();
    if (!title || !imageUrl) return;

    const sortOrder = this.banners().length + 1;
    const targetUrl = this.newTargetUrl().trim() || null;

    this.cmsApi
      .createBanner({
        title,
        imageUrl,
        targetUrl,
        sortOrder,
        isActive: true,
      })
      .subscribe({
        next: () => {
          this.newTitle.set('');
          this.newImageUrl.set('');
          this.newTargetUrl.set('');
          this.showAddForm.set(false);
          this.loadBanners();
        },
        error: () => {
          // Intentional no-op: keep the add-banner form open with the entered
          // values so the user can retry instead of losing their input.
        },
      });
  }
}
