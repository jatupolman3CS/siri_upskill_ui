import { CommonModule, CurrencyPipe } from '@angular/common';
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
  phosphorArrowsCounterClockwise,
  phosphorChartBar,
  phosphorCheckCircle,
  phosphorCurrencyDollar,
  phosphorEye,
  phosphorGraduationCap,
  phosphorImage,
  phosphorReceipt,
  phosphorShieldCheck,
  phosphorSparkle,
  phosphorTag,
  phosphorUsers,
  phosphorWarning,
} from '@ng-icons/phosphor-icons/regular';

import { AdminDashboardSummaryResponse } from './data/admin-dashboard-api.models';
import { AdminDashboardApiService } from './data/admin-dashboard-api.service';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SeoService } from '../../../core/seo/seo.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';

@Component({
  selector: 'app-admin-dashboard-page',
  imports: [CommonModule, RouterLink, NgIcon, CurrencyThbPipe, TranslatePipe, Skeleton],
  templateUrl: './admin-dashboard-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
    provideIcons({
      phosphorCurrencyDollar,
      phosphorUsers,
      phosphorImage,
      phosphorArticle,
      phosphorChartBar,
      phosphorShieldCheck,
      phosphorCheckCircle,
      phosphorArrowRight,
      phosphorGraduationCap,
      phosphorArrowsCounterClockwise,
      phosphorReceipt,
      phosphorTag,
      phosphorSparkle,
      phosphorWarning,
      phosphorEye,
    }),
  ],
})
export class AdminDashboardPage implements OnInit {
  private readonly seoService = inject(SeoService);
  private readonly translation = inject(TranslationService);
  private readonly dashboardApi = inject(AdminDashboardApiService);

  protected readonly isLoading = signal(true);
  protected readonly isError = signal(false);
  protected readonly summary = signal<AdminDashboardSummaryResponse | null>(null);

  ngOnInit(): void {
    this.seoService.set({
      title: this.translation.t('admin.dashboard.seoTitle'),
      description: this.translation.t('admin.dashboard.seoDescription'),
      path: '/admin',
      robots: 'noindex',
    });

    this.loadSummary();
  }

  protected loadSummary(): void {
    this.isLoading.set(true);
    this.isError.set(false);

    this.dashboardApi.getDashboardSummary().subscribe({
      next: (data) => {
        this.summary.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isError.set(true);
        this.isLoading.set(false);
      },
    });
  }
}
