import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import type { KycCaseStatus } from '../../data/tutoring-kyc.models';
import { isKycDisabled } from '../data/admin-errors';
import { AdminKycApiService } from '../data/admin-kyc-api.service';
import type { AdminKycCaseListItem } from '../data/admin-kyc.models';
import { KYC_QUEUE_STATUSES, KYC_WAITING_STATUSES, kycCaseStatusView, kycWaitingView } from '../data/admin-labels';
import { AdminChip } from '../ui/admin-chip';
import { AdminTutoringNav } from '../ui/admin-tutoring-nav';
import { injectUrlFilters, parseOneOf } from '../ui/url-filters';

const PAGE_SIZE = 20;

/**
 * `/admin/tutoring/kyc` - the identity-check review queue (P13-26), oldest submission first. The status filter and the page
 * live in the URL, so Back restores them. "Waiting for review" (Submitted + InReview) is the default; the other statuses are
 * there to look a decided case up again. Each row opens the case; the wait is a number of hours with a tint as a reading aid.
 * While the feature is off on the server the page says so (a state, not a fault).
 */
@Component({
  selector: 'app-admin-kyc-queue-page',
  imports: [RouterLink, TranslatePipe, BangkokDatePipe, Button, EmptyState, Pagination, Skeleton, AdminChip, AdminTutoringNav],
  templateUrl: './admin-kyc-queue-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminKycQueuePage {
  private readonly api = inject(AdminKycApiService);
  private readonly filters = injectUrlFilters();

  /** `null` = the default "waiting" view. */
  protected readonly status = computed<KycCaseStatus | null>(() => parseOneOf(this.filters.get('status'), KYC_QUEUE_STATUSES));
  protected readonly page = this.filters.page;
  protected readonly statusOptions = KYC_QUEUE_STATUSES;

  private readonly casesResource = rxResource({
    params: () => ({ status: this.status(), page: this.page() }),
    stream: ({ params }) => this.api.listCases(params.status === null ? KYC_WAITING_STATUSES : [params.status], params.page, PAGE_SIZE),
  });
  protected readonly items = computed<readonly AdminKycCaseListItem[]>(() => (this.casesResource.hasValue() ? this.casesResource.value().items : []));
  protected readonly totalPages = computed(() => (this.casesResource.hasValue() ? this.casesResource.value().totalPages : 1));
  protected readonly totalCount = computed(() => (this.casesResource.hasValue() ? this.casesResource.value().totalCount : 0));
  protected readonly isLoading = computed(() => this.casesResource.isLoading() && !this.casesResource.hasValue());
  protected readonly isDisabled = computed(() => this.casesResource.status() === 'error' && isKycDisabled(this.casesResource.error()));
  protected readonly hasError = computed(() => this.casesResource.status() === 'error' && !this.isDisabled());

  protected readonly statusView = kycCaseStatusView;
  protected readonly waitingView = kycWaitingView;

  constructor() {
    trackStudioMeta('tutoring.admin.kyc.pageTitle', 'tutoring.admin.kyc.pageDescription', () => '/admin/tutoring/kyc');
  }

  protected chooseStatus(next: KycCaseStatus | null): void {
    this.filters.navigate({ status: next });
  }

  protected goToPage(page: number): void {
    this.filters.navigate({ page: page > 1 ? page : null }, { keepPage: true });
  }

  protected reload(): void {
    this.casesResource.reload();
  }
}
