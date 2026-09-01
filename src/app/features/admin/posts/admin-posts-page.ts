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

import { PostItem } from '../../cms/data/cms-api.models';
import { CmsApiService } from '../../cms/data/cms-api.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';

@Component({
  selector: 'app-admin-posts-page',
  imports: [CommonModule, FormsModule, NgIcon, Spinner],
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

  protected readonly posts = signal<PostItem[]>([]);
  protected readonly isLoading = signal(false);
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

    this.loadPosts();
  }

  protected loadPosts(): void {
    this.isLoading.set(true);
    this.cmsApi.getAdminPosts().subscribe({
      next: (res) => {
        this.posts.set([...res.items]);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  protected createPost(): void {
    const title = this.newTitle().trim();
    let slug = this.newSlug().trim();
    if (!slug && title) {
      slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    }

    const excerpt = this.newExcerpt().trim() || null;
    const contentHtml = this.newContent().trim() || `<p>${title}</p>`;
    const coverImageUrl = this.newCoverUrl().trim() || null;

    this.cmsApi
      .createPost({
        title,
        slug,
        excerpt,
        contentHtml,
        coverImageUrl,
        authorId: 'admin',
        status: 'Published',
      })
      .subscribe({
        next: () => {
          this.newTitle.set('');
          this.newSlug.set('');
          this.newExcerpt.set('');
          this.newContent.set('');
          this.newCoverUrl.set('');
          this.showAddForm.set(false);
          this.loadPosts();
        },
        error: () => {
          // Intentional no-op: keep the add-post form open with the entered
          // values so the user can retry instead of losing their input.
        },
      });
  }

  protected deletePost(id: string): void {
    this.posts.update((list) => list.filter((p) => p.id !== id));
    this.cmsApi.deletePost(id).subscribe({
      next: () => {
        this.loadPosts();
      },
      error: () => {
        this.loadPosts();
      },
    });
  }
}
