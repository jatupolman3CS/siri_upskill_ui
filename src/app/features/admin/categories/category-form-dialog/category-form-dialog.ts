import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';

import { ApiError } from '../../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { Checkbox } from '../../../../shared/checkbox/checkbox';
import { InputField } from '../../../../shared/input/input';
import { Modal } from '../../../../shared/modal/modal';
import { SelectField, SelectOption } from '../../../../shared/select/select';
import { CATEGORY_ICON_KEYS } from '../../../catalog/category-icon';
import { CategoryTreeNode } from '../../../catalog/data/category-api.models';
import { fieldError } from '../../../auth/data/field-error.util';
import {
  CATEGORY_MAX_ICON_KEY_LENGTH,
  CATEGORY_MAX_NAME_LENGTH,
  CATEGORY_MAX_SLUG_LENGTH,
  CATEGORY_SLUG_PATTERN,
  selectableParents,
  suggestSlug,
} from '../category-admin.util';
import { CategoryErrorView } from '../category-error.util';

/** What the dialog hands back; the page turns it into a create or update request. `iconKey`/`parentId` are `null` when empty. */
export interface CategoryFormValue {
  readonly slug: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly iconKey: string | null;
  readonly parentId: string | null;
  readonly isActive: boolean;
}

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value;
  return value.length > 0 && value.trim().length === 0 ? { blank: true } : null;
}

/**
 * Create / edit form for one category, shown in the shared `Modal`. The form fields and rules mirror the backend
 * validators (slug format, name and icon-key lengths). The server stays the authority: its rejection comes back
 * through `errorView` / `apiError` and is shown next to the form — the dialog never closes itself.
 * <para>
 * In create mode the slug follows the English name until the admin edits the slug by hand (the server only has a
 * Thai-to-Latin generator for courses, so a Latin slug always has to be confirmed by a person). Edit mode never touches
 * the slug on its own: changing it breaks existing `/courses?category=` links.
 * </para>
 */
@Component({
  selector: 'app-category-form-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Modal, Button, InputField, SelectField, Checkbox],
  templateUrl: './category-form-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFormDialog {
  private readonly translation = inject(TranslationService);

  readonly open = model(false);
  readonly mode = input.required<'create' | 'edit'>();
  /** Edit mode: the category being edited. */
  readonly target = input<CategoryTreeNode | null>(null);
  /** Edit mode: its current parent (the tree nodes do not carry one). Create mode: the parent to pre-select. */
  readonly parentId = input<string | null>(null);
  readonly tree = input.required<readonly CategoryTreeNode[]>();
  readonly submitting = input(false);
  readonly errorView = input<CategoryErrorView | null>(null);
  readonly apiError = input<ApiError | null>(null);
  readonly save = output<CategoryFormValue>();

  protected readonly maxName = CATEGORY_MAX_NAME_LENGTH;
  protected readonly maxSlug = CATEGORY_MAX_SLUG_LENGTH;

  protected readonly form = new FormGroup({
    nameTh: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(CATEGORY_MAX_NAME_LENGTH)],
    }),
    nameEn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(CATEGORY_MAX_NAME_LENGTH)],
    }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(CATEGORY_MAX_SLUG_LENGTH), Validators.pattern(CATEGORY_SLUG_PATTERN)],
    }),
    parentId: new FormControl('', { nonNullable: true }),
    iconKey: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(CATEGORY_MAX_ICON_KEY_LENGTH)] }),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  protected readonly isEdit = computed(() => this.mode() === 'edit');

  protected readonly titleKey = computed(() => {
    if (this.isEdit()) {
      return 'admin.categories.form.editTitle';
    }
    return this.parentId() ? 'admin.categories.form.createChildTitle' : 'admin.categories.form.createTitle';
  });

  protected readonly parentOptions = computed<readonly SelectOption[]>(() => {
    const english = this.translation.locale() === 'en';
    const rows = selectableParents(this.tree(), this.isEdit() ? this.target() : null).map((row) => ({
      value: row.node.id,
      label: `${'— '.repeat(row.depth)}${english ? row.node.nameEn : row.node.nameTh}`,
    }));
    return [{ value: '', label: this.translation.t('admin.categories.form.noParent') }, ...rows];
  });

  protected readonly iconOptions = computed<readonly SelectOption[]>(() => {
    const current = this.target()?.iconKey;
    // A key outside the supported set (entered some other way) stays selectable so editing never silently clears it.
    const keys = current && this.isEdit() && !CATEGORY_ICON_KEYS.includes(current) ? [...CATEGORY_ICON_KEYS, current] : CATEGORY_ICON_KEYS;
    return [
      { value: '', label: this.translation.t('admin.categories.form.iconNone') },
      ...keys.map((key) => ({ value: key, label: this.iconLabel(key) })),
    ];
  });

  private slugEditedByHand = false;
  private lastSuggestedSlug = '';

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.resetForm());
      }
    });

    this.form.controls.nameEn.valueChanges.pipe(takeUntilDestroyed()).subscribe((nameEn) => {
      if (this.isEdit() || this.slugEditedByHand) {
        return;
      }
      this.lastSuggestedSlug = suggestSlug(nameEn);
      this.form.controls.slug.setValue(this.lastSuggestedSlug, { emitEvent: false });
    });

    this.form.controls.slug.valueChanges.pipe(takeUntilDestroyed()).subscribe((slug) => {
      if (slug !== this.lastSuggestedSlug) {
        this.slugEditedByHand = true;
      }
    });
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.save.emit({
      slug: value.slug.trim(),
      nameTh: value.nameTh.trim(),
      nameEn: value.nameEn.trim(),
      iconKey: value.iconKey.trim() === '' ? null : value.iconKey.trim(),
      parentId: value.parentId === '' ? null : value.parentId,
      isActive: value.isActive,
    });
  }

  /** Client-side message for one control (only once touched), falling back to the server's per-field message. */
  protected message(name: 'nameTh' | 'nameEn' | 'slug', serverProperty: 'NameTh' | 'NameEn' | 'Slug'): string | undefined {
    const control = this.form.controls[name];
    if (control.touched && control.errors) {
      if (control.errors['required'] || control.errors['blank']) {
        return this.translation.t('admin.categories.form.errors.required');
      }
      if (control.errors['maxlength']) {
        const max = (control.errors['maxlength'] as { requiredLength: number }).requiredLength;
        return this.translation.t('admin.categories.form.errors.maxLength', { max });
      }
      if (control.errors['pattern']) {
        return this.translation.t('admin.categories.form.errors.slugFormat');
      }
    }
    return fieldError(this.apiError(), serverProperty);
  }

  /** Translated label for a known icon key; an unknown key is shown as typed (`t()` echoes the path when missing). */
  private iconLabel(key: string): string {
    const path = `admin.categories.icons.${key}`;
    const label = this.translation.t(path);
    return label === path ? key : label;
  }

  private resetForm(): void {
    const target = this.isEdit() ? this.target() : null;
    this.slugEditedByHand = false;
    this.lastSuggestedSlug = '';
    this.form.reset({
      nameTh: target?.nameTh ?? '',
      nameEn: target?.nameEn ?? '',
      slug: target?.slug ?? '',
      parentId: this.parentId() ?? '',
      iconKey: target?.iconKey ?? '',
      isActive: target?.isActive ?? true,
    });
  }
}
