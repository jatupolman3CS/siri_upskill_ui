import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCaretDown } from '@ng-icons/phosphor-icons/regular';

let nextTimeSelectId = 0;

/**
 * A compact, labelled `HH:mm` picker built on a native `<select>` (keyboard and screen-reader behaviour for free - no drag, no
 * custom listbox). It is not a form control: the value is a `model()` the owner reads and writes, which suits a row of a
 * dynamic list better than a `FormControl` per row. The label stays visible (a placeholder is never a label).
 */
@Component({
  selector: 'app-tutor-time-select',
  imports: [NgIcon],
  template: `
    <label [for]="fieldId" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{{ label() }}</label>
    <div class="relative">
      <select
        [id]="fieldId"
        [disabled]="disabled()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
        (change)="pick($event)"
        class="block h-11 w-full appearance-none rounded-[var(--radius-md)] border bg-[var(--glass-bg-strong)] ps-3 pe-9 text-base text-[var(--color-text)] transition-colors duration-200
          disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-text-muted)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        [class]="invalid() ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)] focus-visible:border-[var(--color-primary)]'"
      >
        @if (placeholder(); as text) {
          <option value="" disabled [selected]="value() === ''">{{ text }}</option>
        }
        @for (choice of choices(); track choice) {
          <option [value]="choice" [selected]="choice === value()">{{ choice }}</option>
        }
      </select>
      <ng-icon name="phosphorCaretDown" aria-hidden="true" class="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCaretDown })],
  host: { class: 'block' },
})
export class TutorTimeSelect {
  readonly label = input.required<string>();
  readonly choices = input.required<readonly string[]>();
  readonly value = model.required<string>();
  readonly placeholder = input<string | undefined>(undefined);
  readonly invalid = input(false);
  /** Id of the element that explains an error, when there is one. */
  readonly describedBy = input<string | null>(null);
  readonly disabled = input(false);

  protected readonly fieldId = `app-tutor-time-select-${nextTimeSelectId++}`;

  protected pick(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
