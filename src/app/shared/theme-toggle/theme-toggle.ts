import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, viewChildren } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorDesktop, phosphorMoon, phosphorSun } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';

interface ThemeOption {
  readonly value: ThemePreference;
  readonly icon: string;
  readonly labelKey: string;
}

const OPTIONS: readonly ThemeOption[] = [
  { value: 'light', icon: 'phosphorSun', labelKey: 'theme.light' },
  { value: 'dark', icon: 'phosphorMoon', labelKey: 'theme.dark' },
  { value: 'system', icon: 'phosphorDesktop', labelKey: 'theme.system' },
];

/**
 * Three-way theme switch (light / dark / system) as a WAI-ARIA radio group: one tab stop (the checked
 * radio), arrow keys move + select, same pill look as the header chrome. All three buttons always
 * render, so the server-rendered markup is identical whatever the saved preference is — only
 * `aria-checked`/classes change after hydration.
 *
 * `size="comfortable"` (mobile drawer) uses 44px targets; the default `compact` fits the slim desktop
 * header strip and extends its hit area past the visible pill like `LanguageMenu` does.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [NgIcon, TranslatePipe],
  templateUrl: './theme-toggle.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorSun, phosphorMoon, phosphorDesktop })],
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);

  readonly size = input<'compact' | 'comfortable'>('compact');

  protected readonly options = OPTIONS;
  private readonly buttonSizeClass = computed(() =>
    this.size() === 'comfortable' ? 'h-11 w-11' : 'h-8 w-8',
  );

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('optionButton');

  protected optionClasses(value: ThemePreference): string {
    const state =
      this.theme.preference() === value
        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]';
    return `${this.buttonSizeClass()} ${state}`;
  }

  protected select(value: ThemePreference): void {
    this.theme.set(value);
  }

  protected move(current: ThemePreference, step: 1 | -1, event: Event): void {
    event.preventDefault();
    const index = OPTIONS.findIndex((option) => option.value === current);
    const nextIndex = (index + step + OPTIONS.length) % OPTIONS.length;
    this.theme.set(OPTIONS[nextIndex].value);
    this.buttons()[nextIndex]?.nativeElement.focus();
  }
}
