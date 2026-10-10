import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Button } from '../../../shared/button/button';
import { Checkbox } from '../../../shared/checkbox/checkbox';
import { InputField } from '../../../shared/input/input';
import { PaymentAmountOverrideState, UpdatePaymentAmountOverrideRequest } from './data/payment-amount-override.models';
import {
  OVERRIDE_MAX_AMOUNT,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  amountValidator,
  formErrorKey,
  parseAmount,
  reasonValidator,
  serverFieldError,
} from './payment-override-form.util';

/**
 * The edit form: on/off, amount (THB) and the reason that goes into the audit log. It only validates and emits — the
 * page decides whether a confirmation is needed and talks to the server. Prefilled from the loaded state (the reason
 * always starts empty: every change needs its own justification). Server rejections come back through `apiError` /
 * `errorKey` and are shown next to the field they belong to; editing anything clears them, because they described the
 * previous values.
 */
@Component({
  selector: 'app-payment-override-form',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Checkbox, InputField],
  templateUrl: './payment-override-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentOverrideForm {
  private readonly translation = inject(TranslationService);

  readonly state = input.required<PaymentAmountOverrideState>();
  readonly saving = input(false);
  readonly apiError = input<ApiError | null>(null);
  /** i18n key for a failure that does not belong to one field. */
  readonly errorKey = input<string | null>(null);
  readonly save = output<UpdatePaymentAmountOverrideRequest>();

  protected readonly maxReason = REASON_MAX_LENGTH;

  protected readonly form = new FormGroup({
    isEnabled: new FormControl(false, { nonNullable: true }),
    overrideAmount: new FormControl('', { nonNullable: true, validators: [Validators.required, amountValidator] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, reasonValidator] }),
  });

  private readonly enabled = toSignal(this.form.controls.isEnabled.valueChanges, { initialValue: false });
  private readonly reasonText = toSignal(this.form.controls.reason.valueChanges, { initialValue: '' });

  /** Server-side messages, dropped as soon as the admin edits anything. */
  protected readonly serverError = linkedSignal(() => this.apiError());
  protected readonly formError = linkedSignal(() => this.errorKey());

  protected readonly reasonLength = computed(() => this.reasonText().trim().length);
  protected readonly submitKey = computed(() => {
    if (!this.enabled()) {
      return 'admin.paymentSettings.form.submitDisable';
    }
    return this.state().isEnabled ? 'admin.paymentSettings.form.submitUpdate' : 'admin.paymentSettings.form.submitEnable';
  });

  constructor() {
    effect(() => {
      const current = this.state();
      untracked(() =>
        this.form.reset({
          isEnabled: current.isEnabled,
          overrideAmount: current.overrideAmount === null ? '' : String(current.overrideAmount),
          reason: '',
        }),
      );
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.serverError.set(null);
      this.formError.set(null);
    });
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    const value = this.form.getRawValue();
    const overrideAmount = parseAmount(value.overrideAmount);
    if (this.form.invalid || overrideAmount === null) {
      this.form.markAllAsTouched();
      return;
    }
    this.save.emit({ isEnabled: value.isEnabled, overrideAmount, reason: value.reason.trim() });
  }

  /** Local rule message once the field is touched, otherwise whatever the server said about that field. */
  protected message(name: 'overrideAmount' | 'reason'): string | undefined {
    const control = this.form.controls[name];
    const key = control.touched ? formErrorKey(control.errors) : null;
    if (key) {
      const params: Record<string, string | number> =
        name === 'reason' ? { min: REASON_MIN_LENGTH, max: REASON_MAX_LENGTH } : { max: OVERRIDE_MAX_AMOUNT.toLocaleString('en-US') };
      return this.translation.t(`admin.paymentSettings.form.errors.${key}`, params);
    }
    return serverFieldError(this.serverError(), name);
  }
}
