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
  phosphorArticle,
  phosphorEye,
  phosphorPencilSimple,
  phosphorPlus,
  phosphorTrash,
} from '@ng-icons/phosphor-icons/regular';

import { PostItem, PostStatus } from '../../cms/data/cms-api.models';
import { CmsApiService } from '../../cms/data/cms-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-admin-posts-page',
  imports: [CommonModule, FormsModule, NgIcon],
  templateUrl: './admin-posts-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorPlus,
      phosphorTrash,
      phosphorPencilSimple,
      phosphorArticle,
      phosphorEye,
    }),
  ],
})
export class AdminPostsPage implements OnInit {
  private readonly cmsApi = inject(CmsApiService);
  private readonly seoService = inject(SeoService);

  protected readonly posts = signal<PostItem[]>([
    {
      id: 'p-1',
      title: '5 ทักษะสำคัญในการเป็น AI Software Engineer ในปี 2026',
      slug: '5-key-skills-ai-software-engineer-2026',
      excerpt: 'เจาะลึกเทคโนโลยีที่นักพัฒนาซอฟต์แวร์ต้องรู้เพื่อต่อยอดสู่อนาคต...',
      contentHtml: '<p>เนื้อหาบทความฉบับเต็ม...</p>',
      coverImageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800',
      authorId: 'admin',
      status: 'Published',
      publishedAtUtc: new Date().toISOString(),
      seoTitle: null,
      seoDescription: null,
      createdAtUtc: new Date().toISOString(),
    },
    {
      id: 'p-2',
      title: 'ทำความรู้จัก .NET 10 และ Clean Architecture ฉบับใช้งานจริง',
      slug: 'dotnet-10-clean-architecture-in-practice',
      excerpt: 'แนวทางการออกแบบระบบ Enterprise Backend ด้วย ASP.NET Core และ EF Core...',
      contentHtml: '<p>เนื้อหาบทความ...</p>',
      coverImageUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
      authorId: 'admin',
      status: 'Published',
      publishedAtUtc: new Date().toISOString(),
      seoTitle: null,
      seoDescription: null,
      createdAtUtc: new Date().toISOString(),
    },
  ]);

  protected readonly showAddForm = signal(false);
  protected readonly newTitle = signal('');
  protected readonly newSlug = signal('');
  protected readonly newExcerpt = signal('');
  protected readonly newContent = signal('');
  protected readonly newCoverUrl = signal('');

  ngOnInit(): void {
    this.seoService.set({
      title: 'จัดการบทความและบล็อก | SIRI UpSkill Admin',
      description: 'ระบบ CMS จัดการบทความและข่าวสาร',
      path: '/admin/posts',
      robots: 'noindex',
    });

    this.cmsApi.getAdminPosts().subscribe({
      next: (res) => {
        if (res.items.length > 0) {
          this.posts.set([...res.items]);
        }
      },
      error: () => {},
    });
  }

  protected createPost(): void {
    const title = this.newTitle().trim();
    let slug = this.newSlug().trim();
    if (!slug) {
      slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    }

    const newPost: PostItem = {
      id: `p-${Date.now()}`,
      title,
      slug,
      excerpt: this.newExcerpt().trim() || null,
      contentHtml: this.newContent().trim() || `<p>${title}</p>`,
      coverImageUrl: this.newCoverUrl().trim() || null,
      authorId: 'admin',
      status: 'Published',
      publishedAtUtc: new Date().toISOString(),
      seoTitle: title,
      seoDescription: this.newExcerpt().trim() || null,
      createdAtUtc: new Date().toISOString(),
    };

    this.posts.update((list) => [newPost, ...list]);
    this.newTitle.set('');
    this.newSlug.set('');
    this.newExcerpt.set('');
    this.newContent.set('');
    this.newCoverUrl.set('');
    this.showAddForm.set(false);

    this.cmsApi
      .createPost({
        title: newPost.title,
        slug: newPost.slug,
        excerpt: newPost.excerpt,
        contentHtml: newPost.contentHtml,
        coverImageUrl: newPost.coverImageUrl,
        authorId: 'admin',
        status: 'Published',
      })
      .subscribe({
        next: () => {},
        error: () => {},
      });
  }

  protected deletePost(id: string): void {
    this.posts.update((list) => list.filter((p) => p.id !== id));
    this.cmsApi.deletePost(id).subscribe({
      next: () => {},
      error: () => {},
    });
  }
}
