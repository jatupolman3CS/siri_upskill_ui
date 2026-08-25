import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorArrowLeft,
  phosphorBookOpen,
  phosphorChartBar,
  phosphorCurrencyDollar,
  phosphorHouse,
  phosphorMegaphone,
  phosphorPlusCircle,
  phosphorSignOut,
  phosphorUser,
} from '@ng-icons/phosphor-icons/regular';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-instructor-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  templateUrl: './instructor-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorHouse,
      phosphorBookOpen,
      phosphorChartBar,
      phosphorCurrencyDollar,
      phosphorMegaphone,
      phosphorPlusCircle,
      phosphorArrowLeft,
      phosphorUser,
      phosphorSignOut,
    }),
  ],
})
export class InstructorLayout {
  protected readonly auth = inject(AuthService);
}
