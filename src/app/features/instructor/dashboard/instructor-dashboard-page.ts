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
  phosphorChartBar,
  phosphorCurrencyDollar,
  phosphorEye,
  phosphorPencilSimple,
  phosphorPlusCircle,
  phosphorStar,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { CourseSearchResultItem } from '../../catalog/data/course-api.models';
import { CourseApiService } from '../../catalog/data/course-api.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-instructor-dashboard-page',
  imports: [CommonModule, RouterLink, NgIcon, CurrencyThbPipe],
  templateUrl: './instructor-dashboard-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCurrencyDollar,
      phosphorUsers,
      phosphorBookOpen,
      phosphorStar,
      phosphorPlusCircle,
      phosphorPencilSimple,
      phosphorEye,
      phosphorChartBar,
      phosphorArrowRight,
    }),
  ],
})
export class InstructorDashboardPage implements OnInit {
  private readonly courseApi = inject(CourseApiService);
  private readonly seoService = inject(SeoService);

  protected readonly courses = signal<readonly CourseSearchResultItem[]>([]);
  protected readonly isLoading = signal(true);

  ngOnInit(): void {
    this.seoService.set({
      title: 'แดชบอร์ดผู้สอน | SIRI UpSkill Studio',
      description: 'ภาพรวมรายได้ นักเรียน และหลักสูตรของคุณบน SIRI UpSkill',
      path: '/instructor',
      robots: 'noindex',
    });

    this.loadCourses();
  }

  private loadCourses(): void {
    this.isLoading.set(true);
    this.courseApi.searchCourses({ page: 1, pageSize: 20 }).subscribe({
      next: (res) => {
        this.courses.set(res.results.items);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }
}
