import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { Modal } from '../../../../../shared/modal/modal';
import { Pagination } from '../../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import type { Guid } from '../../../data/tutoring-public.models';
import { tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminKycApiService } from '../../data/admin-kyc-api.service';
import type { KycAccessLogItem } from '../../data/admin-kyc.models';

const PAGE_SIZE = 10;

/**
 * Who opened one identity document and when, newest first (P13-26, `GET admin/kyc/documents/{id}/access-logs`). Read-only: the
 * log is written by the server on every view and cannot be edited. Fetched afresh each time the dialog opens, because a stale
 * list could hide a recent access. An administrator is shown by the first characters of their id (their name is not part of
 * the answer); the system (the purge job) has no user.
 */
@Component({
  selector: 'app-kyc-access-log-dialog',
  imports: [TranslatePipe, BangkokDatePipe, Button, Modal, Pagination, Skeleton],
  templateUrl: './kyc-access-log-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KycAccessLogDialog {
  private readonly api = inject(AdminKycApiService);

  readonly open = model(false);
  readonly documentId = input.required<Guid>();
  /** i18n key of the document type, for the title. */
  readonly typeLabelKey = input.required<string>();

  protected readonly page = signal(1);

  private readonly logResource = rxResource({
    params: () => (this.open() ? { documentId: this.documentId(), page: this.page() } : undefined),
    stream: ({ params }) => this.api.listAccessLogs(params.documentId, params.page, PAGE_SIZE),
  });
  protected readonly items = computed<readonly KycAccessLogItem[]>(() => (this.logResource.hasValue() ? this.logResource.value().items : []));
  protected readonly totalPages = computed(() => (this.logResource.hasValue() ? this.logResource.value().totalPages : 1));
  protected readonly isLoading = computed(() => this.logResource.isLoading() && !this.logResource.hasValue());
  protected readonly errorKey = computed(() => (this.logResource.status() === 'error' ? tutoringAdminErrorKey(this.logResource.error()) : null));

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.page.set(1));
      }
    });
  }

  protected shortId(userId: Guid | null): string {
    return userId === null ? '' : userId.slice(0, 8);
  }

  protected reload(): void {
    this.logResource.reload();
  }
}
