import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorBank,
  phosphorCheckCircle,
  phosphorClock,
  phosphorInfo,
  phosphorPencilSimple,
} from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { InputField } from '../../../../shared/input/input';
import { SelectField, SelectOption } from '../../../../shared/select/select';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { fieldError } from '../../../auth/data/field-error.util';
import { validationMessage } from '../../../auth/validation-message.util';
import { PAYOUT_BANK_CODES } from '../../../payout/data/payout-banks';
import { PayoutApiService } from '../../../payout/data/payout-api.service';
import { TaxPayerType } from '../../../payout/data/payout-api.models';
import {
  ACCOUNT_NAME_MAX_LENGTH,
  TAX_ID_MAX_LENGTH,
  TAX_PAYER_TYPES,
  accountNoValidator,
  buildUpsertRequest,
  trimmedText,
} from './payout-account-form.util';

interface PayoutAccountForm {
  bankCode: FormControl<string>;
  accountNo: FormControl<string>;
  accountName: FormControl<string>;
  taxPayerType: FormControl<TaxPayerType>;
  taxId: FormControl<string>;
}

/**
 * FluentValidation `PropertyName`s the server may flag on a 400 (PascalCase, exactly as in the C# command record),
 * mapped to the i18n key suffix of the translated message shown next to that field.
 */
const SERVER_FIELD_KEYS = {
  BankCode: 'bankCode',
  AccountNo: 'accountNo',
  AccountName: 'accountName',
  TaxId: 'taxId',
  TaxPayerType: 'taxPayerType',
} as const;
type ServerField = keyof typeof SERVER_FIELD_KEYS;
const SERVER_FIELDS = Object.keys(SERVER_FIELD_KEYS) as readonly ServerField[];

/**
 * Instructor payout (bank) account on `/instructor/earnings` — a money + PII card, so nothing is ever invented:
 * the saved account is shown exactly as the backend returns it (account number and tax id already masked), and the
 * full number is never read back into the form. `GET` answering 404 is the normal "no account yet" state (empty state
 * with an add button); every other failure is a real load error with retry. Saving uses the upsert `PUT`, which
 * resets the admin verification, so the card says so up front and shows the current verification status in text + icon.
 * Account numbers are never logged.
 */
@Component({
  selector: 'app-payout-account-card',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, BangkokDatePipe, Button, InputField, SelectField, Skeleton, EmptyState],
  templateUrl: './payout-account-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  providers: [provideIcons({ phosphorBank, phosphorCheckCircle, phosphorClock, phosphorInfo, phosphorPencilSimple })],
})
export class PayoutAccountCard {
  private readonly api = inject(PayoutApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly translation = inject(TranslationService);

  private readonly errorSummary = viewChild<ElementRef<HTMLElement>>('errorSummary');
  private readonly toggleButton = viewChild<ElementRef<HTMLElement>>('toggleButton');

  private readonly accountResource = rxResource({ stream: () => this.api.getMyPayoutAccount() });

  /** `resource.value()` throws while the status is 'error', so every read goes through `hasValue()`. */
  protected readonly account = computed(() => (this.accountResource.hasValue() ? this.accountResource.value() : undefined));
  protected readonly loading = computed(() => this.accountResource.isLoading() && !this.accountResource.hasValue());
  private readonly loadStatus = computed(() => {
    const error: unknown = this.accountResource.error();
    if (error === undefined) {
      return undefined;
    }
    // `ApiError` in the app (error interceptor) — read structurally so a raw `HttpErrorResponse` works the same.
    const status = (error as { readonly status?: unknown }).status;
    return typeof status === 'number' ? status : 0;
  });
  /** 404 = this instructor has not registered an account yet: an empty state, not a failure. */
  protected readonly notCreatedYet = computed(() => !this.accountResource.hasValue() && this.loadStatus() === 404);
  protected readonly loadFailed = computed(() => !this.accountResource.hasValue() && this.loadStatus() !== undefined && this.loadStatus() !== 404);

  protected readonly editing = signal(false);
  protected readonly submitting = signal(false);
  protected readonly apiError = signal<ApiError | null>(null);
  protected readonly showClientErrorSummary = signal(false);
  private readonly focusSummaryRequest = signal(0);
  private readonly focusToggleRequest = signal(0);
  private handledSummaryRequest = 0;
  private handledToggleRequest = 0;

  protected readonly form = new FormGroup<PayoutAccountForm>({
    bankCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    accountNo: new FormControl('', { nonNullable: true, validators: [accountNoValidator] }),
    accountName: new FormControl('', { nonNullable: true, validators: [trimmedText({ required: true, max: ACCOUNT_NAME_MAX_LENGTH })] }),
    taxPayerType: new FormControl<TaxPayerType>('Individual', { nonNullable: true, validators: [Validators.required] }),
    taxId: new FormControl('', { nonNullable: true, validators: [trimmedText({ required: false, max: TAX_ID_MAX_LENGTH })] }),
  });

  protected readonly bankOptions = computed<readonly SelectOption[]>(() => {
    const options = PAYOUT_BANK_CODES.map((code) => ({ value: code, label: this.bankLabel(code) }));
    const saved = this.account()?.bankCode;
    // A code stored by other means that is not in the list still has to be selectable when editing it.
    return saved && !options.some((o) => o.value === saved) ? [...options, { value: saved, label: saved }] : options;
  });

  protected readonly taxPayerOptions = computed<readonly SelectOption[]>(() =>
    TAX_PAYER_TYPES.map((type) => ({ value: type, label: this.translation.t(`instructor.payoutAccount.taxPayerType.${type}`) })),
  );

  /** Failures that are not tied to one field (403 / 409 / network / unflagged 400) — field errors stay inline. */
  protected readonly formLevelMessage = computed<string | null>(() => {
    const error = this.apiError();
    if (!error || (error.status === 400 && this.flaggedServerFields(error))) {
      return null;
    }
    switch (error.status) {
      case 400:
        return this.translation.t('instructor.payoutAccount.errors.invalid');
      case 403:
        return this.translation.t('instructor.payoutAccount.errors.forbidden');
      case 409:
        return this.translation.t('instructor.payoutAccount.errors.conflict');
      default:
        return this.translation.t('instructor.payoutAccount.errors.generic');
    }
  });

  constructor() {
    // A server-side field error describes the values that were sent — drop it as soon as the person edits them.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.apiError()?.status === 400) {
        this.apiError.set(null);
      }
    });

    afterRenderEffect(() => {
      const summaryRequest = this.focusSummaryRequest();
      if (summaryRequest !== this.handledSummaryRequest) {
        this.handledSummaryRequest = summaryRequest;
        this.errorSummary()?.nativeElement.focus();
      }
      const toggleRequest = this.focusToggleRequest();
      if (toggleRequest !== this.handledToggleRequest) {
        this.handledToggleRequest = toggleRequest;
        this.toggleButton()?.nativeElement.focus();
      }
    });
  }

  protected bankLabel(code: string): string {
    return (PAYOUT_BANK_CODES as readonly string[]).includes(code) ? this.translation.t(`instructor.payoutAccount.banks.${code}`) : code;
  }

  protected taxPayerLabel(type: TaxPayerType): string {
    return this.translation.t(`instructor.payoutAccount.taxPayerType.${type}`);
  }

  protected toggleEditing(): void {
    if (this.submitting()) {
      return;
    }
    if (this.editing()) {
      this.closeForm();
      return;
    }
    const saved = this.account();
    // Only non-secret fields are pre-filled: the masked account number and tax id cannot be edited, so they are re-entered.
    this.form.reset({
      bankCode: saved?.bankCode ?? '',
      accountNo: '',
      accountName: saved?.accountName ?? '',
      taxPayerType: saved?.taxPayerType ?? 'Individual',
      taxId: '',
    });
    this.apiError.set(null);
    this.showClientErrorSummary.set(false);
    this.editing.set(true);
  }

  protected retry(): void {
    this.accountResource.reload();
  }

  protected bankError(): string | undefined {
    return this.fieldMessage(this.form.controls.bankCode, 'BankCode');
  }

  protected accountNoError(): string | undefined {
    return this.fieldMessage(this.form.controls.accountNo, 'AccountNo');
  }

  protected accountNameError(): string | undefined {
    return this.fieldMessage(this.form.controls.accountName, 'AccountName');
  }

  protected taxPayerTypeError(): string | undefined {
    return this.fieldMessage(this.form.controls.taxPayerType, 'TaxPayerType');
  }

  protected taxIdError(): string | undefined {
    return this.fieldMessage(this.form.controls.taxId, 'TaxId');
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.showClientErrorSummary.set(true);
      this.apiError.set(null);
      this.focusSummaryRequest.update((n) => n + 1);
      return;
    }

    this.showClientErrorSummary.set(false);
    this.apiError.set(null);
    this.submitting.set(true);

    this.api
      .upsertPayoutAccount(buildUpsertRequest(this.form.getRawValue()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.submitting.set(false);
          // The confirmed server response — never a locally composed guess — becomes the displayed account.
          this.accountResource.set(saved);
          this.closeForm();
          this.toast.success(this.translation.t('instructor.payoutAccount.saved'));
        },
        error: (error: ApiError) => {
          this.submitting.set(false);
          this.apiError.set(error);
          this.focusSummaryRequest.update((n) => n + 1);
        },
      });
  }

  private closeForm(): void {
    // Drop the typed account number / tax id from memory along with the form.
    this.form.reset({ bankCode: '', accountNo: '', accountName: '', taxPayerType: 'Individual', taxId: '' });
    this.apiError.set(null);
    this.showClientErrorSummary.set(false);
    this.editing.set(false);
    this.focusToggleRequest.update((n) => n + 1);
  }

  private flaggedServerFields(error: ApiError): boolean {
    return SERVER_FIELDS.some((field) => fieldError(error, field) !== undefined);
  }

  private fieldMessage(control: AbstractControl, serverField: ServerField): string | undefined {
    if (control.touched && control.errors?.['digits']) {
      return this.translation.t('instructor.payoutAccount.validation.accountNoDigits');
    }
    const client = validationMessage(control, this.translation);
    if (client) {
      return client;
    }
    // The server's own wording is English FluentValidation text — show a translated, field-specific message instead.
    return fieldError(this.apiError(), serverField) === undefined
      ? undefined
      : this.translation.t(`instructor.payoutAccount.errors.server.${SERVER_FIELD_KEYS[serverField]}`);
  }
}
