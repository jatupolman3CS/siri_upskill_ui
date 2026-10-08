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
  phosphorArrowRight,
  phosphorBookOpen,
  phosphorCheckCircle,
  phosphorGraduationCap,
  phosphorPlayCircle,
  phosphorSparkle,
  phosphorWarningCircle,
} from '@ng-icons/phosphor-icons/regular';

import { LearningPathDetail } from '../data/learning-path-api.models';
import { LearningPathApiService } from '../data/learning-path-api.service';
import { buildLearningPathJsonLd } from '../../../core/seo/schema-org.util';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';

@Component({
  selector: 'app-learning-path-detail-page',
  imports: [CommonModule, RouterLink, NgIcon, TranslatePipe, Skeleton],
  templateUrl: './learning-path-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorArrowLeft,
      phosphorArrowRight,
      phosphorGraduationCap,
      phosphorBookOpen,
      phosphorPlayCircle,
      phosphorSparkle,
      phosphorCheckCircle,
      phosphorWarningCircle,
    }),
  ],
})
export class LearningPathDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly learningPathApi = inject(LearningPathApiService);
  private readonly seoService = inject(SeoService);

  protected readonly path = signal<LearningPathDetail | null>(null);
  protected readonly isLoading = signal(true);
  /** True once the path cannot be shown; the template owns the (localized) wording, never a string set here. */
  protected readonly error = signal(false);

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) {
      this.error.set(true);
      this.isLoading.set(false);
      return;
    }

    this.learningPathApi.getLearningPathBySlug(slug).subscribe({
      next: (res) => {
        this.path.set(res);
        this.isLoading.set(false);

        const items = res.courses.map((c, index) => ({
          name: c.title,
          url: this.seoService.absoluteUrl(`/courses/${c.slug}`),
          position: index + 1,
        }));

        this.seoService.set({
          title: `${res.title} | เส้นทางการเรียนรู้ SIRI UpSkill`,
          description: res.description || 'หลักสูตรเส้นทางการเรียนรู้แบบเป็นขั้นตอน',
          path: `/learning-paths/${res.slug}`,
          jsonLd: [
            buildLearningPathJsonLd({
              name: res.title,
              description: res.description || '',
              url: this.seoService.absoluteUrl(`/learning-paths/${res.slug}`),
              items,
            }),
          ],
        });
      },
      error: () => {
        this.error.set(true);
        this.isLoading.set(false);
      },
    });
  }
}
