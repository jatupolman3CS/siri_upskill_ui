import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { TranslationService } from '../../core/i18n/translation.service';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerColor = 'primary' | 'white' | 'current' | 'muted';

@Component({
  selector: 'app-spinner',
  templateUrl: './spinner.html',
  styleUrl: './spinner.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex items-center justify-center gap-2',
    role: 'status',
    '[attr.aria-label]': 'resolvedAriaLabel()',
  },
})
export class Spinner {
  private readonly translation = inject(TranslationService);

  readonly size = input<SpinnerSize>('md');
  readonly color = input<SpinnerColor>('primary');
  readonly label = input<string | undefined>(undefined);
  /** Explicit label wins; otherwise the translated default ("Loading..."). */
  readonly ariaLabel = input<string | undefined>(undefined);

  protected readonly resolvedAriaLabel = computed(
    () => this.ariaLabel() ?? this.translation.t('common.loading'),
  );

  protected readonly sizeClasses = computed(() => {
    switch (this.size()) {
      case 'xs':
        return 'h-3.5 w-3.5 border-[1.5px]';
      case 'sm':
        return 'h-4 w-4 border-2';
      case 'lg':
        return 'h-8 w-8 border-3';
      case 'md':
      default:
        return 'h-5 w-5 border-2';
    }
  });

  protected readonly colorClasses = computed(() => {
    switch (this.color()) {
      case 'white':
        return 'border-white/30 border-t-white';
      case 'current':
        return 'border-current/30 border-t-current';
      case 'muted':
        return 'border-[var(--color-border)] border-t-[var(--color-text-muted)]';
      case 'primary':
      default:
        return 'border-[var(--color-primary)]/25 border-t-[var(--color-primary)]';
    }
  });
}
