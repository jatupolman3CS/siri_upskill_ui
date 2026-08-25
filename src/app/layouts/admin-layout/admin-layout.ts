import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArticle,
  phosphorCurrencyDollar,
  phosphorGraduationCap,
  phosphorHouse,
  phosphorImage,
  phosphorSignOut,
  phosphorTag,
  phosphorUser,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  templateUrl: './admin-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorHouse,
      phosphorGraduationCap,
      phosphorUsers,
      phosphorTag,
      phosphorImage,
      phosphorArticle,
      phosphorCurrencyDollar,
      phosphorUser,
      phosphorSignOut,
    }),
  ],
})
export class AdminLayout {
  protected readonly auth = inject(AuthService);
}
