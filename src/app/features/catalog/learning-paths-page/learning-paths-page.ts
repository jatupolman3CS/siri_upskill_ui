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
  phosphorBookOpen,
  phosphorCheckCircle,
  phosphorCompass,
  phosphorGraduationCap,
  phosphorSparkle,
} from '@ng-icons/phosphor-icons/regular';

import { LearningPathSummary } from '../data/learning-path-api.models';
import { LearningPathApiService } from '../data/learning-path-api.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';

@Component({
  selector: 'app-learning-paths-page',
  imports: [CommonModule, RouterLink, NgIcon, TranslatePipe, Skeleton],
  templateUrl: './learning-paths-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCompass,
      phosphorGraduationCap,
      phosphorBookOpen,
      phosphorArrowRight,
      phosphorSparkle,
      phosphorCheckCircle,
    }),
  ],
})
export class LearningPathsPage implements OnInit {
  private readonly learningPathApi = inject(LearningPathApiService);
  private readonly seoService = inject(SeoService);

  protected readonly paths = signal<LearningPathSummary[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly hasError = signal(false);

  ngOnInit(): void {
    this.seoService.set({
      title: 'เส้นทางการเรียนรู้ (Learning Paths) | SIRI UpSkill',
      description: 'แผนการเรียนรู้ที่รวบรวมหลักสูตรตั้งแต่เริ่มต้นจนถึงระดับผู้เชี่ยวชาญ เจาะลึกตามสายอาชีพ',
      path: '/learning-paths',
    });

    this.loadPaths();
  }

  protected loadPaths(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.learningPathApi.getLearningPaths().subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.items ?? []);
        this.paths.set([...items]);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }
}
