import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

let nextTextareaId = 0;

/**
 * A labelled multi-line text field for the tutoring forms (the shared kit has single-line inputs only). Same contract as
 * `app-input`: a visible `<label>`, an error that replaces the helper text, `aria-invalid` + `aria-describedby`, a 44px+
 * hit area and the focus ring never removed. `maxLength` only drives the character counter - it does not truncate; the form
 * checks the limit and the server re-checks it.
 */
@Component({
  selector: 'app-tutor-textarea',
  imports: [TranslatePipe],
  template: `
    <label [for]="fieldId" class="mb-1.5 block text-sm font-medium text-[var(--color-text)]">
      {{ label() }}
      @if (required()) {
        <span aria-hidden="true" class="text-[var(--color-danger)]">*</span>
        <span class="sr-only">({{ 'shared.field.required' | translate }})</span>
      }
    </label>
    <textarea
      [id]="fieldId"
      [rows]="rows()"
      [value]="value()"
      [disabled]="isDisabled()"
      [attr.aria-required]="required() ? 'true' : null"
      [attr.aria-invalid]="hasError() ? 'true' : null"
      [attr.aria-describedby]="describedBy()"
      (input)="handleInput($event)"
      (blur)="onTouched()"
      class="block w-full rounded-[var(--radius-md)] border bg-[var(--glass-bg-strong)] px-3.5 py-3 text-base text-[var(--color-text)] transition-colors duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)]"
      [class]="hasError() ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)] focus-visible:border-[var(--color-primary)]'"
    ></textarea>
    <div class="mt-1.5 flex flex-wrap justify-between gap-2 text-sm">
      @if (hasError()) {
        <p [id]="errorId" role="alert" class="text-[var(--color-danger)]">{{ errorMessage() }}</p>
      } @else if (helperText()) {
        <p [id]="helperId" class="text-[var(--color-text-muted)]">{{ helperText() }}</p>
      }
      @if (maxLength() > 0) {
        <p class="ms-auto text-[var(--color-text-muted)]">{{ 'tutoring.tutor.common.charCount' | translate: { count: value().length, max: maxLength() } }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TutorTextarea), multi: true }],
  host: { class: 'block' },
})
export class TutorTextarea implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly helperText = input<string | undefined>(undefined);
  readonly errorMessage = input<string | undefined>(undefined);
  readonly required = input(false);
  readonly rows = input(4);
  /** `0` hides the counter. */
  readonly maxLength = input(0);

  protected readonly fieldId = `app-tutor-textarea-${nextTextareaId++}`;
  protected readonly helperId = `${this.fieldId}-helper`;
  protected readonly errorId = `${this.fieldId}-error`;

  protected readonly value = signal('');
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.formDisabled());
  protected readonly hasError = computed(() => !!this.errorMessage());
  protected readonly describedBy = computed<string | null>(() => {
    if (this.hasError()) {
      return this.errorId;
    }
    return this.helperText() ? this.helperId : null;
  });

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }

  protected handleInput(event: Event): void {
    const next = (event.target as HTMLTextAreaElement).value;
    this.value.set(next);
    this.onChange(next);
  }
}
