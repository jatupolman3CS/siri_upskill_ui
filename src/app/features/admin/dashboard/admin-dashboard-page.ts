import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArticle,
  phosphorArrowRight,
  phosphorChartBar,
  phosphorCheckCircle,
  phosphorCurrencyDollar,
  phosphorImage,
  phosphorShieldCheck,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SeoService } from '../../../core/seo/seo.service';

@Component({
  selector: 'app-admin-dashboard-page',
  imports: [CommonModule, RouterLink, NgIcon],
  templateUrl: './admin-dashboard-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorCurrencyDollar,
      phosphorUsers,
      phosphorImage,
      phosphorArticle,
      phosphorChartBar,
      phosphorShieldCheck,
      phosphorCheckCircle,
      phosphorArrowRight,
    }),
  ],
})
export class AdminDashboardPage implements OnInit {
  private readonly seoService = inject(SeoService);

  ngOnInit(): void {
    this.seoService.set({
      title: 'แดชบอร์ดผู้ดูแลระบบ | SIRI UpSkill Admin',
      description: 'ภาพรวมระบบ จัดการแบนเนอร์ ข่าวสาร และรอบจ่ายเงิน',
      path: '/admin',
      robots: 'noindex',
    });
  }
}
