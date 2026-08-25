import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowRight,
  phosphorArticle,
  phosphorCalendar,
  phosphorClock,
  phosphorUser,
} from '@ng-icons/phosphor-icons/regular';

import { PostItem } from '../../cms/data/cms-api.models';
import { CmsApiService } from '../../cms/data/cms-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-blog-list-page',
  imports: [CommonModule, RouterLink, NgIcon],
  templateUrl: './blog-list-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArticle,
      phosphorCalendar,
      phosphorUser,
      phosphorClock,
      phosphorArrowRight,
    }),
  ],
})
export class BlogListPage implements OnInit {
  private readonly cmsApi = inject(CmsApiService);
  private readonly seoService = inject(SeoService);

  protected readonly posts = signal<readonly PostItem[]>([
    {
      id: 'p-1',
      title: '5 ทักษะสำคัญในการเป็น AI Software Engineer ในปี 2026',
      slug: '5-key-skills-ai-software-engineer-2026',
      excerpt: 'เจาะลึกเทคโนโลยีที่นักพัฒนาซอฟต์แวร์ต้องรู้เพื่อต่อยอดสู่อนาคต ตั้งแต่ Large Language Models, Agents, Vector Databases ไปจนถึง Full-Stack Deployment',
      contentHtml: '<p>เนื้อหาฉบับเต็ม...</p>',
      coverImageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800',
      authorId: 'admin',
      status: 'Published',
      publishedAtUtc: '2026-08-15T09:00:00Z',
      seoTitle: '5 ทักษะสำคัญ AI Software Engineer 2026 | SIRI UpSkill Blog',
      seoDescription: 'เจาะลึกทักษะ AI Engineer ที่ตลาดต้องการมากที่สุด',
      createdAtUtc: '2026-08-15T09:00:00Z',
    },
    {
      id: 'p-2',
      title: 'ทำความรู้จัก .NET 10 และ Clean Architecture ฉบับใช้งานจริง',
      slug: 'dotnet-10-clean-architecture-in-practice',
      excerpt: 'แนวทางการออกแบบระบบ Enterprise Backend ด้วย ASP.NET Core, EF Core และ CQRS ให้สามารถรองรับการขยายตัวได้อย่างมั่นคง',
      contentHtml: '<p>เนื้อหาฉบับเต็ม...</p>',
      coverImageUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
      authorId: 'admin',
      status: 'Published',
      publishedAtUtc: '2026-08-10T14:30:00Z',
      seoTitle: '.NET 10 Clean Architecture ฉบับใช้งานจริง | SIRI UpSkill Blog',
      seoDescription: 'เรียนรู้แนวคิด Clean Architecture บน .NET 10',
      createdAtUtc: '2026-08-10T14:30:00Z',
    },
    {
      id: 'p-3',
      title: 'Angular 22 Signals & Reactive Primitives ทำงานอย่างไร',
      slug: 'angular-22-signals-and-reactive-primitives',
      excerpt: 'สรุปการเปลี่ยนแปลงครั้งสำคัญของ Angular กับระบบ Signals, Resource API และ Zoneless Change Detection',
      contentHtml: '<p>เนื้อหาฉบับเต็ม...</p>',
      coverImageUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800',
      authorId: 'admin',
      status: 'Published',
      publishedAtUtc: '2026-08-01T11:00:00Z',
      seoTitle: 'Angular 22 Signals เจาะลึก | SIRI UpSkill Blog',
      seoDescription: 'ทำความเข้าใจ Angular Signals และประโยชน์ต่อประสิทธิภาพ',
      createdAtUtc: '2026-08-01T11:00:00Z',
    },
  ]);

  ngOnInit(): void {
    this.seoService.set({
      title: 'บทความ & ข่าวสาร | SIRI UpSkill Blog',
      description: 'รวมบทความ เทคนิค และข่าวสารความรู้ด้านเทคโนโลยีจากทีมงาน SIRI UpSkill',
      path: '/blog',
    });

    this.cmsApi.getPublishedPosts().subscribe({
      next: (res) => {
        if (res.items.length > 0) {
          this.posts.set(res.items);
        }
      },
      error: () => {},
    });
  }
}
