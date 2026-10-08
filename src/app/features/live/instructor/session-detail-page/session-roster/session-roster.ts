import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorMinusCircle, phosphorUsers } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { EmptyState } from '../../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { LiveInstructorApiService } from '../../../data/live-instructor-api.service';
import type { RosterFilter } from '../../../data/live-instructor.models';

const PAGE_SIZE = 25;
const FILTERS: readonly RosterFilter[] = ['all', 'joined', 'notJoined'];

/**
 * Who was invited / who actually opened the room. Emails arrive already masked (`a***@g***.com`) — the full address is
 * never sent to the instructor — and "joined" means the learner asked the platform for the room link (not proof they
 * stayed in the call).
 */
@Component({
  selector: 'app-live-session-roster',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, Button, EmptyState, Pagination, Skeleton],
  templateUrl: './session-roster.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorMinusCircle, phosphorUsers })],
  host: { class: 'block' },
})
export class SessionRoster {
  private readonly api = inject(LiveInstructorApiService);

  readonly sessionId = input.required<string>();

  protected readonly filters = FILTERS;
  protected readonly filter = signal<RosterFilter>('all');
  protected readonly page = signal(1);

  protected readonly rosterResource = rxResource({
    params: () => ({ sessionId: this.sessionId(), filter: this.filter(), page: this.page() }),
    stream: ({ params }) =>
      this.api.getRoster(params.sessionId, { filter: params.filter, page: params.page, pageSize: PAGE_SIZE }),
  });

  protected readonly result = computed(() => (this.rosterResource.hasValue() ? this.rosterResource.value() : null));
  protected readonly isLoading = computed(() => this.rosterResource.isLoading() && !this.rosterResource.hasValue());
  protected readonly hasError = computed(() => !this.rosterResource.hasValue() && this.rosterResource.status() === 'error');
  protected readonly skeletonRows = [0, 1, 2, 3];

  protected setFilter(next: RosterFilter): void {
    if (next !== this.filter()) {
      this.filter.set(next);
      this.page.set(1);
    }
  }

  protected goToPage(next: number): void {
    this.page.set(next);
  }

  protected retry(): void {
    this.rosterResource.reload();
  }
}
