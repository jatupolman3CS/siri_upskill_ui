import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorGraduationCap } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** Logo badge + wordmark (+ optional tiny subtitle) linking home — shared by the header and the footer. */
@Component({
  selector: 'app-brand-logo',
  imports: [RouterLink, NgIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorGraduationCap })],
  template: `
    <a
      routerLink="/"
      class="hit-44 flex w-fit items-center gap-2.5 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
    >
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-primary)] shadow-[var(--shadow-glow)]
          text-xl text-[var(--color-primary-foreground)]"
      >
        <ng-icon name="phosphorGraduationCap" aria-hidden="true" />
      </span>
      <span class="flex flex-col leading-tight">
        <span class="text-base font-bold text-[var(--color-text)]">{{ 'common.appName' | translate }}</span>
        @if (showSubtitle()) {
          <span class="hidden text-xs font-medium text-[var(--color-text-muted)] sm:block">{{ 'nav.brandSubtitle' | translate }}</span>
        }
      </span>
    </a>
  `,
})
export class BrandLogo {
  readonly showSubtitle = input(true);
}
