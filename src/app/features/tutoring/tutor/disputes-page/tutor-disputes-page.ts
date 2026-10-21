import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowLeft, phosphorArrowRight } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { setPageMeta } from '../../../../core/seo/page-meta';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { StatusChip } from '../../../live/instructor/ui/status-chip/status-chip';
import { TutorDisputeApiService } from '../../data/tutor-dispute-api.service';
import type { DisputeListItem, DisputeStatus } from '../../data/tutoring-dispute.models';
import { disputeCategoryLabelKey, disputeFlowLabelKey, localizedName } from '../../data/tutoring-labels';
import { disputeStatusView } from '../../data/tutoring-my.util';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';

const PAGE_SIZE = 10;
const STATUS_FILTERS: readonly { readonly id: string; readonly labelKey: string }[] = [
  { id: '', labelKey: 'tutoring.tutor.disputes.list.filterAll' },
  { id: 'Open', labelKey: 'tutoring.disputeStatus.Open' },
  { id: 'UnderReview', labelKey: 'tutoring.disputeStatus.UnderReview' },
  { id: 'Resolved', labelKey: 'tutoring.disputeStatus.Resolved' },
  { id: 'Rejected', labelKey: 'tutoring.disputeStatus.Rejected' },
  { id: 'Withdrawn', labelKey: 'tutoring.disputeStatus.Withdrawn' },
];

/**
 * `/instructor/tutoring/disputes` (P13-35, signed-in instructor, client-rendered, noindex).
 * Lists all disputes on classes owned by the tutor with status filtering and pagination in the URL.
 * Accessible even if the tutor is unverified or suspended.
 */
@Component({
  selector: 'app-tutor-disputes-page',
  imports: [RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, EmptyState, Skeleton, StatusChip, TutorPortalNav],
  templateUrl: './tutor-disputes-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowLeft, phosphorArrowRight })],
})
export class TutorDisputesPage {
  private readonly api = inject(TutorDisputeApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly i18n = inject(TranslationService);

  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly currentStatus = computed(() => this.queryParams().get('status') ?? '');
  protected readonly currentPage = computed(() => {
    const raw = this.queryParams().get('page');
    const parsed = raw ? parseInt(raw, 10) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });

  protected readonly filters = STATUS_FILTERS;

  private readonly disputesResource = rxResource({
    params: () => ({
      status: this.currentStatus() || undefined,
      page: this.currentPage(),
      pageSize: PAGE_SIZE,
    }),
    stream: ({ params }) => this.api.listDisputes(params),
  });

  protected readonly result = computed(() => (this.disputesResource.hasValue() ? this.disputesResource.value() : null));
  protected readonly items = computed(() => this.result()?.items ?? []);
  protected readonly totalCount = computed(() => this.result()?.totalCount ?? 0);
  protected readonly totalPages = computed(() => this.result()?.totalPages ?? 0);
  protected readonly isLoading = computed(() => this.disputesResource.isLoading() && !this.disputesResource.hasValue());
  protected readonly hasError = computed(() => this.disputesResource.status() === 'error');

  protected readonly categoryKey = disputeCategoryLabelKey;
  protected readonly flowKey = disputeFlowLabelKey;

  constructor() {
    const i18n = this.i18n;
    setPageMeta({
      title: `${i18n.t('tutoring.tutor.disputes.list.pageTitle')} | ${i18n.t('common.appName')}`,
      description: i18n.t('tutoring.tutor.disputes.list.pageDescription'),
      robots: 'noindex',
    });
  }

  protected reload(): void {
    this.disputesResource.reload();
  }

  protected setStatusFilter(status: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: status || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected setPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }

  protected statusView(status: DisputeStatus) {
    return disputeStatusView(status);
  }

  protected subjectName(item: DisputeListItem): string {
    return localizedName({ nameTh: item.subjectNameTh, nameEn: item.subjectNameEn }, this.i18n.locale());
  }
}
