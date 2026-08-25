import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorCalendar,
  phosphorClock,
  phosphorShareNetwork,
  phosphorUser,
} from '@ng-icons/phosphor-icons/regular';

import { PostItem } from '../../cms/data/cms-api.models';
import { CmsApiService } from '../../cms/data/cms-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-blog-detail-page',
  imports: [CommonModule, RouterLink, NgIcon],
  templateUrl: './blog-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowLeft,
      phosphorCalendar,
      phosphorClock,
      phosphorUser,
      phosphorShareNetwork,
    }),
  ],
})
export class BlogDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly cmsApi = inject(CmsApiService);
  private readonly seoService = inject(SeoService);

  protected readonly post = signal<PostItem | null>(null);

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.loadPost(slug);
  }

  private loadPost(slug: string): void {
    this.cmsApi.getPublishedPostBySlug(slug).subscribe({
      next: (postData) => {
        this.post.set(postData);
        this.seoService.set({
          title: `${postData.seoTitle ?? postData.title} | SIRI UpSkill Blog`,
          description: postData.seoDescription ?? postData.excerpt ?? '',
          path: `/blog/${slug}`,
          openGraph: { image: postData.coverImageUrl },
        });
      },
      error: () => {
        // Fallback demo mock
        const fallback: PostItem = {
          id: 'p-demo',
          title: '5 ทักษะสำคัญในการเป็น AI Software Engineer ในปี 2026',
          slug,
          excerpt: 'เจาะลึกเทคโนโลยีที่นักพัฒนาซอฟต์แวร์ต้องรู้เพื่อต่อยอดสู่อนาคต...',
          contentHtml: `
            <p class="lead">ในยุคที่เทคโนโลยี AI และ Generative Agents เติบโตอย่างก้าวกระโดด นักพัฒนาซอฟต์แวร์จำเป็นต้องปรับตัวและเพิ่มพูนทักษะที่เกี่ยวข้องเพื่อให้พร้อมสำหรับการสร้างนวัตกรรมระดับ Enterprise</p>
            <h3>1. ความเข้าใจใน Large Language Model Architecture</h3>
            <p>การเข้าใจกลไก Transformer, Context Window, Tokenization และ Attention Mechanism ช่วยให้เราสามารถออกแบบ Prompt และ System Context ได้อย่างมีประสิทธิภาพสูงสุด</p>
            <h3>2. Retrieval-Augmented Generation (RAG) & Vector Databases</h3>
            <p>การนำข้อมูลขององค์กรมาเชื่อมต่อกับ AI จำเป็นต้องอาศัย Vector Embeddings และ Hybrid Search เพื่อให้ผลลัพธ์มีความแม่นยำและปลอดภัย</p>
            <h3>3. Clean Architecture & Production-Grade API Design</h3>
            <p>การสร้างระบบที่ยั่งยืนยังคงต้องการรากฐานของ Software Architecture ที่ดี เช่น Domain-Driven Design, Hexagonal Architecture และ Robust Error Handling</p>
          `,
          coverImageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200',
          authorId: 'admin',
          status: 'Published',
          publishedAtUtc: '2026-08-15T09:00:00Z',
          seoTitle: '5 ทักษะสำคัญ AI Software Engineer 2026',
          seoDescription: 'เจาะลึกทักษะ AI Engineer ที่ตลาดต้องการมากที่สุด',
          createdAtUtc: '2026-08-15T09:00:00Z',
        };
        this.post.set(fallback);
        this.seoService.set({
          title: `${fallback.title} | SIRI UpSkill Blog`,
          description: fallback.excerpt ?? '',
          path: `/blog/${slug}`,
        });
      },
    });
  }
}
