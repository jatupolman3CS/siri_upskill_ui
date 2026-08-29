import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

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
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class Spinner {
  readonly size = input<SpinnerSize>('md');
  readonly color = input<SpinnerColor>('primary');
  readonly label = input<string | undefined>(undefined);
  readonly ariaLabel = input<string>('กำลังโหลด...');

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
