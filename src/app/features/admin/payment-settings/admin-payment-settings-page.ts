import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorWarning, phosphorWarningCircle } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../core/http/error.interceptor';
import { CurrencyThbPipe } from '../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Button } from '../../../shared/button/button';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Modal } from '../../../shared/modal/modal';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { trackStudioMeta } from '../../live/instructor/studio-meta';
import { PaymentAmountOverrideState, UpdatePaymentAmountOverrideRequest } from './data/payment-amount-override.models';
import { PaymentAmountOverrideApiService } from './data/payment-amount-override-api.service';
import { PaymentOverrideForm } from './payment-override-form';
import { saveErrorKey } from './payment-override-form.util';
import { PaymentOverrideHistory, PaymentOverrideHistoryView } from './payment-override-history';
import { PaymentOverrideStatus } from './payment-override-status';

const HISTORY_PAGE_SIZE = 20;

/**
 * `/admin/payment-settings` — the payment amount override. While it is ON, every NEW PaymentIntent is charged the fixed
 * amount (the server takes the lower of it and the order total), which is how real-money flows get smoke-tested in
 * production. Because it changes what customers are charged, ACTIVE is shown loudly, turning it on (or changing the
 * amount while on) needs an explicit confirmation, and every change lands in the audit history below the form.
 * <para>
 * The server stays the authority on every rule (amount range, reason length); the form mirrors them only to fail early
 * and shows the server's field errors when it still rejects.
 * </para>
 */
@Component({
  selector: 'app-admin-payment-settings-page',
  imports: [
    NgIcon,
    TranslatePipe,
    CurrencyThbPipe,
    Button,
    EmptyState,
    Modal,
    Skeleton,
    PaymentOverrideStatus,
    PaymentOverrideForm,
    PaymentOverrideHistory,
  ],
  templateUrl: './admin-payment-settings-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorWarning, phosphorWarningCircle })],
})
export class AdminPaymentSettingsPage {
  private readonly api = inject(PaymentAmountOverrideApiService);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly historyPage = signal(1);
  protected readonly stateResource = rxResource({ stream: () => this.api.getState() });
  protected readonly historyResource = rxResource({
    params: () => ({ page: this.historyPage() }),
    stream: ({ params }) => this.api.getHistory(params.page, HISTORY_PAGE_SIZE),
  });

  /** Last setting that loaded — kept across a failed refresh. `.value()` is only ever read behind `hasValue()`. */
  protected readonly state = linkedSignal<PaymentAmountOverrideState | undefined, PaymentAmountOverrideState | null>({
    source: () => (this.stateResource.hasValue() ? this.stateResource.value() : undefined),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  protected readonly hasError = computed(() => this.stateResource.status() === 'error' && this.state() === null);
  protected readonly isLoading = computed(() => this.state() === null && !this.hasError());
  /** A setting is on screen but the latest refresh failed, so it may be out of date. */
  protected readonly isStale = computed(() => this.stateResource.status() === 'error' && this.state() !== null);

  protected readonly historyResult = computed(() => (this.historyResource.hasValue() ? this.historyResource.value() : null));
  protected readonly historyView = computed<PaymentOverrideHistoryView>(() => {
    if (this.historyResource.status() === 'error') {
      return 'error';
    }
    const result = this.historyResult();
    if (!result) {
      return 'loading';
    }
    return result.items.length === 0 ? 'empty' : 'ready';
  });

  protected readonly saving = signal(false);
  protected readonly saveApiError = signal<ApiError | null>(null);
  protected readonly saveFailureKey = signal<string | null>(null);
  /** The change waiting for the admin's explicit "yes" in the confirmation dialog. */
  protected readonly pending = signal<UpdatePaymentAmountOverrideRequest | null>(null);
  protected readonly confirmOpen = signal(false);

  constructor() {
    trackStudioMeta('admin.paymentSettings.pageTitle', 'admin.paymentSettings.pageDescription', () => '/admin/payment-settings');
  }

  /** Switching ON, or changing the amount while ON, charges customers a different amount — that needs a confirmation. */
  protected onSave(request: UpdatePaymentAmountOverrideRequest): void {
    if (this.saving()) {
      return;
    }
    const current = this.state();
    if (request.isEnabled && (!current?.isEnabled || current.overrideAmount !== request.overrideAmount)) {
      this.pending.set(request);
      this.confirmOpen.set(true);
      return;
    }
    this.send(request);
  }

  protected confirm(): void {
    const request = this.pending();
    if (request) {
      this.send(request);
    }
  }

  protected reloadState(): void {
    this.stateResource.reload();
  }

  protected reloadHistory(): void {
    this.historyResource.reload();
  }

  private send(request: UpdatePaymentAmountOverrideRequest): void {
    this.saving.set(true);
    this.saveApiError.set(null);
    this.saveFailureKey.set(null);
    this.api
      .update(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.confirmOpen.set(false);
          this.pending.set(null);
          this.toast.success(this.translation.t(request.isEnabled ? 'admin.paymentSettings.toast.enabled' : 'admin.paymentSettings.toast.disabled'));
          this.stateResource.reload();
          // The newest entry is on page 1: go there (which loads it) or, already there, load it again.
          if (this.historyPage() === 1) {
            this.historyResource.reload();
          } else {
            this.historyPage.set(1);
          }
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.confirmOpen.set(false);
          this.saveApiError.set(error instanceof ApiError ? error : null);
          this.saveFailureKey.set(saveErrorKey(error));
        },
      });
  }
}
