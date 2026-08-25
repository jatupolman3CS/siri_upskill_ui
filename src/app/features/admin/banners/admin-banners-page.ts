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
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-admin-banners-page',
  imports: [CommonModule, FormsModule, NgIcon],
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

  protected readonly banners = signal<BannerItem[]>([
    {
      id: 'b-1',
      title: 'คอร์สแนะนำเดือนนี้ ลดสูงสุด 50%',
      imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200',
      targetUrl: '/courses',
      sortOrder: 1,
      isActive: true,
      startsAtUtc: null,
      endsAtUtc: null,
      createdAtUtc: new Date().toISOString(),
    },
    {
      id: 'b-2',
      title: 'เส้นทางการเรียนรู้ Full-Stack AI Engineer',
      imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200',
      targetUrl: '/courses',
      sortOrder: 2,
      isActive: true,
      startsAtUtc: null,
      endsAtUtc: null,
      createdAtUtc: new Date().toISOString(),
    },
  ]);

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

    this.cmsApi.getAdminBanners().subscribe({
      next: (res) => {
        if (res.items.length > 0) {
          this.banners.set([...res.items]);
        }
      },
      error: () => {},
    });
  }

  protected toggleActive(banner: BannerItem): void {
    this.banners.update((list) =>
      list.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b))
    );
  }

  protected deleteBanner(id: string): void {
    this.banners.update((list) => list.filter((b) => b.id !== id));
    this.cmsApi.deleteBanner(id).subscribe({
      next: () => {},
      error: () => {},
    });
  }

  protected createBanner(): void {
    const title = this.newTitle().trim();
    const imageUrl = this.newImageUrl().trim();
    if (!title || !imageUrl) return;

    const newBanner: BannerItem = {
      id: `b-${Date.now()}`,
      title,
      imageUrl,
      targetUrl: this.newTargetUrl().trim() || null,
      sortOrder: this.banners().length + 1,
      isActive: true,
      startsAtUtc: null,
      endsAtUtc: null,
      createdAtUtc: new Date().toISOString(),
    };

    this.banners.update((list) => [...list, newBanner]);
    this.newTitle.set('');
    this.newImageUrl.set('');
    this.newTargetUrl.set('');
    this.showAddForm.set(false);

    this.cmsApi
      .createBanner({
        title,
        imageUrl,
        targetUrl: newBanner.targetUrl,
        sortOrder: newBanner.sortOrder,
        isActive: true,
      })
      .subscribe({
        next: () => {},
        error: () => {},
      });
  }
}
