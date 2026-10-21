import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorStar } from '@ng-icons/phosphor-icons/regular';
import { phosphorStarFill } from '@ng-icons/phosphor-icons/fill';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

let nextRatingId = 0;

/** The stars of the scale, one to five. */
const STARS: readonly number[] = [1, 2, 3, 4, 5];

/**
 * A 1-5 star rating, either an input (a form control) or a read-only display.
 * <para>
 * Input mode is a native radio group, which is the right semantics for "pick exactly one of five": one tab stop for the whole
 * group, the arrow keys move and select, and a screen reader hears "3 of 5 stars, radio button, 3 of 5". Each radio sits invisibly
 * (`sr-only`) inside a label that draws the star, so the focus ring is drawn on the label (`has-[:focus-visible]`) and never removed.
 * The value is also written out as text ("3 / 5") beside the stars, so the selection never rests on the fill colour alone.
 * </para>
 * <para>
 * Read-only mode draws the same stars as a single image with a text alternative. Both modes size the stars at 44 px (touch target)
 * only when interactive.
 * </para>
 */
@Component({
  selector: 'app-star-rating-input',
  imports: [NgIcon, TranslatePipe],
  template: `
    @if (readonly()) {
      <span class="inline-flex items-center gap-1.5" role="img" [attr.aria-label]="'tutoring.review.rating.option' | translate: { count: value() ?? 0, max: max }">
        <span class="inline-flex" aria-hidden="true">
          @for (star of stars; track star) {
            <ng-icon [name]="star <= (value() ?? 0) ? 'phosphorStarFill' : 'phosphorStar'" class="text-xl text-[var(--color-accent)]" />
          }
        </span>
        <span aria-hidden="true" class="text-sm font-semibold text-[var(--color-text)]">{{ value() ?? 0 }} / {{ max }}</span>
      </span>
    } @else {
      <fieldset class="m-0 min-w-0 border-0 p-0" [attr.aria-describedby]="hasError() ? errorId : null" [attr.aria-required]="required() ? 'true' : null">
        <legend class="mb-1.5 p-0 text-sm font-medium text-[var(--color-text)]">
          {{ label() }}
          @if (required()) {
            <span aria-hidden="true" class="text-[var(--color-danger)]">*</span>
            <span class="sr-only">({{ 'shared.field.required' | translate }})</span>
          }
        </legend>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div class="flex items-center">
            @for (star of stars; track star) {
              <label
                class="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[var(--radius-md)] transition-colors
                  has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-focus-ring)] hover:bg-[var(--color-surface-muted)]"
                [class.cursor-not-allowed]="isDisabled()"
              >
                <input
                  type="radio"
                  class="sr-only"
                  [name]="groupName"
                  [value]="star"
                  [checked]="value() === star"
                  [disabled]="isDisabled()"
                  [attr.aria-invalid]="hasError() ? 'true' : null"
                  (change)="select(star)"
                  (blur)="onTouched()"
                />
                <ng-icon aria-hidden="true" class="text-2xl text-[var(--color-accent)]" [name]="value() !== null && star <= (value() ?? 0) ? 'phosphorStarFill' : 'phosphorStar'" />
                <span class="sr-only">{{ 'tutoring.review.rating.option' | translate: { count: star, max: max } }}</span>
              </label>
            }
          </div>
          <span class="text-sm font-semibold text-[var(--color-text)]" aria-hidden="true">{{ value() ?? 0 }} / {{ max }}</span>
        </div>
        @if (hasError()) {
          <p [id]="errorId" role="alert" class="mt-1.5 text-sm text-[var(--color-danger)]">{{ errorMessage() }}</p>
        }
      </fieldset>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorStar, phosphorStarFill }), { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StarRatingInput), multi: true }],
  host: { class: 'block' },
})
export class StarRatingInput implements ControlValueAccessor {
  readonly label = input('');
  readonly required = input(false);
  readonly errorMessage = input<string | undefined>(undefined);
  /** Draw the stars as a static image with a text alternative instead of a radio group. */
  readonly readonly = input(false);
  /** Used by the read-only mode, which has no form control: the rating to draw. */
  readonly rating = input<number | null>(null);

  protected readonly stars = STARS;
  protected readonly max = STARS.length;
  protected readonly groupName = `app-star-rating-${nextRatingId++}`;
  protected readonly errorId = `${this.groupName}-error`;

  private readonly formValue = signal<number | null>(null);
  private readonly formDisabled = signal(false);
  /** The control's value, or the `rating` input for a read-only display. */
  protected readonly value = computed(() => (this.readonly() ? this.rating() : this.formValue()));
  protected readonly isDisabled = computed(() => this.formDisabled());
  protected readonly hasError = computed(() => !!this.errorMessage());

  private onChange: (value: number | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: number | null): void {
    this.formValue.set(value);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }

  protected select(star: number): void {
    this.formValue.set(star);
    this.onChange(star);
  }
}
