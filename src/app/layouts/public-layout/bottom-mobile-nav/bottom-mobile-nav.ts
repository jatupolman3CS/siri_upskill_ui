import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorGraduationCap,
  phosphorHouse,
  phosphorMagnifyingGlass,
  phosphorReceipt,
  phosphorUser,
} from '@ng-icons/phosphor-icons/regular';
import { AuthService } from '../../../core/auth/auth.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-bottom-mobile-nav',
  imports: [CommonModule, RouterLink, RouterLinkActive, NgIcon, TranslatePipe],
  templateUrl: './bottom-mobile-nav.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      phosphorHouse,
      phosphorMagnifyingGlass,
      phosphorGraduationCap,
      phosphorReceipt,
      phosphorUser,
    }),
  ],
})
export class BottomMobileNav {
  protected readonly auth = inject(AuthService);
}
