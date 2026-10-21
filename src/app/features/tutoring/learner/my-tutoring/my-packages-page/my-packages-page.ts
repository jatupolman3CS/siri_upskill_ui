import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { setPageMeta } from '../../../../../core/seo/page-meta';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { packageStatusLabelKey } from '../../../data/tutoring-labels';
import { TutoringPackagePurchaseApiService } from '../../../data/tutoring-package-purchase-api.service';
import type { PackagePurchaseStatus, PackagePurchaseSummary } from '../../../data/tutoring-package-purchase.models';
import { PACKAGE_PURCHASE_STATUSES, parsePackageStatus } from '../../../data/tutoring-package.util';
import { pageOf } from '../my-tutoring-page/my-tutoring-page';
import { PackageCard } from '../package-card/package-card';

const PAGE_SIZE = 10;

/**
 * `/my-tutoring/packages` (P13-22b, signed-in, client-rendered, `noindex`) - the learner's lesson packages: what they bought, how many
 * lessons are left and until when. The status filter and the page live in the URL (`?status=Active&page=2`), so the back button, a
 * reload and a shared link land where the person was. Every figure and flag on a card is the server's - the page only lays them out.
 */
@Component({
  selector: 'app-my-packages-page',
  imports: [RouterLink, TranslatePipe, Button, EmptyState, Pagination, Skeleton, PackageCard],
  templateUrl: './my-packages-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyPackagesPage {
  private readonly api = inject(TutoringPackagePurchaseApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly statuses = PACKAGE_PURCHASE_STATUSES;
  protected readonly statusKey = packageStatusLabelKey;
  private readonly query = toSignal(
    this.route.queryParamMap.pipe(map((params) => ({ status: parsePackageStatus(params.get('status')), page: pageOf(params.get('page')) }))),
    { requireSync: true },
  );
  protected readonly status = computed(() => this.query().status);
  protected readonly page = computed(() => this.query().page);

  private readonly packagesResource = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.listMyPackages({ status: params.status ?? undefined, page: params.page, pageSize: PAGE_SIZE }),
  });
  protected readonly items = computed<readonly PackagePurchaseSummary[]>(() => (this.packagesResource.hasValue() ? this.packagesResource.value().items : []));
  protected readonly totalPages = computed(() => (this.packagesResource.hasValue() ? this.packagesResource.value().totalPages : 1));
  protected readonly totalCount = computed(() => (this.packagesResource.hasValue() ? this.packagesResource.value().totalCount : 0));
  protected readonly isLoading = computed(() => this.packagesResource.isLoading() && !this.packagesResource.hasValue());
  protected readonly hasError = computed(() => this.packagesResource.status() === 'error');
  protected readonly errorKey = computed(() => (this.hasError() ? tutoringErrorKey(this.packagesResource.error()) : ''));

  constructor() {
    const i18n = inject(TranslationService);
    setPageMeta({
      title: `${i18n.t('tutoring.learner.packages.my.pageTitle')} | ${i18n.t('common.appName')}`,
      description: i18n.t('tutoring.learner.packages.my.pageDescription'),
      robots: 'noindex',
    });
  }

  protected chooseStatus(next: PackagePurchaseStatus | null): void {
    if (next !== this.status()) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { status: next, page: null }, queryParamsHandling: 'merge' });
    }
  }

  protected goToPage(next: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page: next > 1 ? next : null }, queryParamsHandling: 'merge' });
  }

  protected reload(): void {
    this.packagesResource.reload();
  }
}
