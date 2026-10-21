import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { InputField } from '../../../../shared/input/input';
import { Pagination } from '../../../../shared/pagination/pagination';
import { SelectField, type SelectOption } from '../../../../shared/select/select';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import type { TutorStatus } from '../../data/tutoring-tutor.models';
import { tutoringAdminErrorKey } from '../data/admin-errors';
import { ADMIN_TUTOR_STATUSES, tutorStatusView } from '../data/admin-labels';
import { AdminTutorApiService } from '../data/admin-tutor-api.service';
import type { AdminTutorListItem } from '../data/admin-tutor.models';
import { AdminChip } from '../ui/admin-chip';
import { AdminTutoringNav } from '../ui/admin-tutoring-nav';
import { injectUrlFilters, parseOneOf } from '../ui/url-filters';

const PAGE_SIZE = 20;
const SEARCH_MAX = 100;

/**
 * `/admin/tutoring/tutors` - every tutor, filterable by status and searchable by display name (P13-26). The filters and the page
 * live in the URL. A row shows what an administrator triages on - state, listing, rating, reliability, own commission - and opens
 * the tutor. Read-only: the actions (suspend, reinstate, commission) are on the detail page.
 */
@Component({
  selector: 'app-admin-tutors-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, BangkokDatePipe, Button, EmptyState, InputField, Pagination, SelectField, Skeleton, AdminChip, AdminTutoringNav],
  templateUrl: './admin-tutors-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTutorsPage {
  private readonly api = inject(AdminTutorApiService);
  private readonly i18n = inject(TranslationService);
  private readonly filters = injectUrlFilters();

  protected readonly status = computed<TutorStatus | null>(() => parseOneOf(this.filters.get('status'), ADMIN_TUTOR_STATUSES));
  protected readonly search = computed(() => (this.filters.get('q') ?? '').slice(0, SEARCH_MAX));
  protected readonly page = this.filters.page;
  protected readonly hasFilters = computed(() => this.status() !== null || this.search() !== '');

  protected readonly statusControl = new FormControl('', { nonNullable: true });
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly statusOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.i18n.t('tutoring.admin.tutors.statusAny') },
    ...ADMIN_TUTOR_STATUSES.map((status) => ({ value: status, label: this.i18n.t(`tutoring.enums.tutorStatus.${status}`) })),
  ]);

  private readonly tutorsResource = rxResource({
    params: () => ({ status: this.status(), q: this.search(), page: this.page() }),
    stream: ({ params }) => this.api.listTutors({ status: params.status ?? undefined, q: params.q || undefined, page: params.page, pageSize: PAGE_SIZE }),
  });
  protected readonly items = computed<readonly AdminTutorListItem[]>(() => (this.tutorsResource.hasValue() ? this.tutorsResource.value().items : []));
  protected readonly totalPages = computed(() => (this.tutorsResource.hasValue() ? this.tutorsResource.value().totalPages : 1));
  protected readonly totalCount = computed(() => (this.tutorsResource.hasValue() ? this.tutorsResource.value().totalCount : 0));
  protected readonly isLoading = computed(() => this.tutorsResource.isLoading() && !this.tutorsResource.hasValue());
  protected readonly hasError = computed(() => this.tutorsResource.status() === 'error');
  protected readonly errorKey = computed(() => (this.hasError() ? tutoringAdminErrorKey(this.tutorsResource.error()) : ''));
  protected readonly statusView = tutorStatusView;

  constructor() {
    trackStudioMeta('tutoring.admin.tutors.pageTitle', 'tutoring.admin.tutors.pageDescription', () => '/admin/tutoring/tutors');
    // The URL is the source of truth: back/forward and pasted links flow into the controls (without re-navigating).
    effect(() => {
      this.statusControl.setValue(this.status() ?? '', { emitEvent: false });
      this.searchControl.setValue(this.search(), { emitEvent: false });
    });
  }

  protected applyStatus(): void {
    this.filters.navigate({ status: this.statusControl.value });
  }

  protected applySearch(): void {
    this.filters.navigate({ q: this.searchControl.value.trim().slice(0, SEARCH_MAX) });
  }

  protected clearFilters(): void {
    this.filters.navigate({ status: null, q: null });
  }

  protected goToPage(page: number): void {
    this.filters.navigate({ page: page > 1 ? page : null }, { keepPage: true });
  }

  protected reload(): void {
    this.tutorsResource.reload();
  }
}
