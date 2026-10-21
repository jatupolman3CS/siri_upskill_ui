import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
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
import { clockOffsetMs } from '../../../../live/learner/live-clock';
import type { BookingListItem } from '../../../data/tutoring-learner.models';
import { TutoringLearnerApiService } from '../../../data/tutoring-learner-api.service';
import type { BookingScope } from '../../../data/tutoring-my-bookings.models';
import { nextJoinOpensDelayMs } from '../../../data/tutoring-my.util';
import { BookingCard } from '../booking-card/booking-card';

export type MyTutoringTab = 'upcoming' | 'history';

const PAGE_SIZE = 10;
const TAB_SCOPE: Readonly<Record<MyTutoringTab, BookingScope>> = { upcoming: 'upcoming', history: 'past' };

/** `?tab=history` selects History; anything else (or nothing) is Upcoming. */
export function tabOf(value: string | null): MyTutoringTab {
  return value === 'history' ? 'history' : 'upcoming';
}

/** `?page=` as a whole number from 1; anything else is page 1. */
export function pageOf(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * `/my-tutoring` (P13-23, signed-in, client-rendered, `noindex`) - the learner's lessons: Upcoming and History, a page at a time.
 * The tab and the page live in the URL (`?tab=history&page=2`), so the back button, a reload and a shared link all land where
 * the person was; the list is read again whenever either changes. Every figure and flag on a card is the server's - the page
 * only lays them out. It also asks the server again at the moment a join window opens (`nextJoinOpensDelayMs`), so a lesson
 * that becomes joinable while the page is open gets its Join button without a reload.
 */
@Component({
  selector: 'app-my-tutoring-page',
  imports: [RouterLink, TranslatePipe, Button, EmptyState, Pagination, Skeleton, BookingCard],
  templateUrl: './my-tutoring-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTutoringPage {
  private readonly api = inject(TutoringLearnerApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs: readonly MyTutoringTab[] = ['upcoming', 'history'];
  private readonly query = toSignal(this.route.queryParamMap.pipe(map((params) => ({ tab: tabOf(params.get('tab')), page: pageOf(params.get('page')) }))), {
    requireSync: true,
  });
  protected readonly tab = computed(() => this.query().tab);
  protected readonly page = computed(() => this.query().page);

  private readonly bookingsResource = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.listMyBookings({ scope: TAB_SCOPE[params.tab], page: params.page, pageSize: PAGE_SIZE }),
  });
  protected readonly items = computed<readonly BookingListItem[]>(() => (this.bookingsResource.hasValue() ? this.bookingsResource.value().items : []));
  protected readonly totalPages = computed(() => (this.bookingsResource.hasValue() ? this.bookingsResource.value().totalPages : 1));
  protected readonly totalCount = computed(() => (this.bookingsResource.hasValue() ? this.bookingsResource.value().totalCount : 0));
  protected readonly isLoading = computed(() => this.bookingsResource.isLoading() && !this.bookingsResource.hasValue());
  protected readonly hasError = computed(() => this.bookingsResource.status() === 'error');
  /** The server clock minus this device's, taken from the newest answer; the countdowns on the cards use it. */
  protected readonly offsetMs = computed(() => {
    const first = this.items().at(0);
    return first === undefined ? 0 : clockOffsetMs(first.serverTimeUtc);
  });

  constructor() {
    const i18n = inject(TranslationService);
    setPageMeta({
      title: `${i18n.t('tutoring.learner.my.pageTitle')} | ${i18n.t('common.appName')}`,
      description: i18n.t('tutoring.learner.my.pageDescription'),
      robots: 'noindex',
    });

    // Read the list again when the soonest join window opens, so the server's `canJoin` is current without a reload.
    afterRenderEffect((onCleanup) => {
      const delay = nextJoinOpensDelayMs(this.items(), this.offsetMs());
      if (delay === null) {
        return;
      }
      const timer = setTimeout(() => this.reload(), delay);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected chooseTab(next: MyTutoringTab): void {
    if (next !== this.tab()) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: next === 'upcoming' ? null : next, page: null },
        queryParamsHandling: 'merge',
      });
    }
  }

  protected goToPage(next: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: next > 1 ? next : null },
      queryParamsHandling: 'merge',
    });
  }

  protected reload(): void {
    this.bookingsResource.reload();
  }
}
