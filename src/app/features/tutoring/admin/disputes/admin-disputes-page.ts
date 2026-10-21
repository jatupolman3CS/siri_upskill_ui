import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { Checkbox } from '../../../../shared/checkbox/checkbox';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { InputField } from '../../../../shared/input/input';
import { Pagination } from '../../../../shared/pagination/pagination';
import { SelectField, type SelectOption } from '../../../../shared/select/select';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { tutoringAdminErrorKey } from '../data/admin-errors';
import { AdminDisputeApiService } from '../data/admin-dispute-api.service';
import type { AdminDisputeListItem, AdminDisputeQuery, DisputeSort } from '../data/admin-dispute.models';
import { DISPUTE_CATEGORIES, DISPUTE_FLOWS, DISPUTE_PRIORITIES, DISPUTE_SORTS, disputeStatusView, disputePriorityKey, disputeSortKey } from '../data/admin-labels';
import { AdminChip } from '../ui/admin-chip';
import { AdminTutoringNav } from '../ui/admin-tutoring-nav';
import { injectUrlFilters, parseFlag, parseOneOf } from '../ui/url-filters';
import { STATUS_PARAMS, type StatusParam, rowFlags, statusParamToQuery } from './dispute-view.util';

interface SummaryTile {
  readonly id: string;
  readonly value: number;
  readonly filter: Readonly<Record<string, string | boolean>> | null;
}

const PAGE_SIZE = 20;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEARCH_MAX = 40;

/**
 * `/admin/tutoring/disputes` - the dispute queue (P13-26): tiles with today's numbers (those that match a filter are buttons),
 * filters (status, category, flow, priority, sort, overdue / mine / needs follow-up, one tutor, a dispute or booking number),
 * and the cases themselves, most urgent first by default (the server's SLA order). All filters and the page live in the URL.
 * Flags beside each case are the server's own (overdue, priority, repeat complaint, follow-up, escrow too late); "waiting for
 * us" is the last message not being an administrator's.
 */
@Component({
  selector: 'app-admin-disputes-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, Checkbox, EmptyState, InputField, Pagination, SelectField, Skeleton, AdminChip, AdminTutoringNav],
  templateUrl: './admin-disputes-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class AdminDisputesPage {
  private readonly api = inject(AdminDisputeApiService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);
  private readonly filters = injectUrlFilters();

  private readonly statusParam = computed(() => parseOneOf<StatusParam>(this.filters.get('status'), STATUS_PARAMS));
  protected readonly query = computed<AdminDisputeQuery>(() => {
    const tutorId = this.filters.get('tutorId');
    return {
      status: statusParamToQuery(this.statusParam()),
      category: parseOneOf(this.filters.get('category'), DISPUTE_CATEGORIES) ?? undefined,
      flow: parseOneOf(this.filters.get('flow'), DISPUTE_FLOWS) ?? undefined,
      priority: parseOneOf(this.filters.get('priority'), DISPUTE_PRIORITIES) ?? undefined,
      overdue: parseFlag(this.filters.get('overdue')),
      assignedToMe: parseFlag(this.filters.get('assignedToMe')),
      needsFollowUp: parseFlag(this.filters.get('needsFollowUp')),
      tutorId: tutorId !== null && GUID.test(tutorId) ? tutorId : undefined,
      q: (this.filters.get('q') ?? '').trim().slice(0, SEARCH_MAX) || undefined,
      sort: parseOneOf<DisputeSort>(this.filters.get('sort'), DISPUTE_SORTS) ?? undefined,
      page: this.filters.page(),
      pageSize: PAGE_SIZE,
    };
  });
  protected readonly page = this.filters.page;
  protected readonly hasFilters = computed(() => {
    const q = this.query();
    return this.statusParam() !== null || [q.category, q.flow, q.priority, q.tutorId, q.q, q.sort].some((value) => value !== undefined) || !!q.overdue || !!q.assignedToMe || !!q.needsFollowUp;
  });

  protected readonly form = new FormGroup({
    status: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    flow: new FormControl('', { nonNullable: true }),
    priority: new FormControl('', { nonNullable: true }),
    sort: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
    overdue: new FormControl(false, { nonNullable: true }),
    assignedToMe: new FormControl(false, { nonNullable: true }),
    needsFollowUp: new FormControl(false, { nonNullable: true }),
  });

  private option(group: string, value: string): SelectOption {
    return { value, label: this.i18n.t(`${group}.${value}`) };
  }
  private anyOption(): SelectOption {
    return { value: '', label: this.i18n.t('tutoring.admin.disputes.any') };
  }
  protected readonly statusOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.i18n.t('tutoring.admin.disputes.statusActive') },
    ...STATUS_PARAMS.map((value) => (value === 'all' ? { value, label: this.i18n.t('tutoring.admin.disputes.statusAll') } : this.option('tutoring.admin.disputes.status', value))),
  ]);
  protected readonly categoryOptions = computed<SelectOption[]>(() => [this.anyOption(), ...DISPUTE_CATEGORIES.map((value) => this.option('tutoring.enums.disputeCategory', value))]);
  protected readonly flowOptions = computed<SelectOption[]>(() => [this.anyOption(), ...DISPUTE_FLOWS.map((value) => this.option('tutoring.enums.disputeFlow', value))]);
  protected readonly priorityOptions = computed<SelectOption[]>(() => [this.anyOption(), ...DISPUTE_PRIORITIES.map((value) => ({ value, label: this.i18n.t(disputePriorityKey(value)) }))]);
  protected readonly sortOptions = computed<SelectOption[]>(() => DISPUTE_SORTS.map((value) => ({ value, label: this.i18n.t(disputeSortKey(value)) })));

  private readonly summaryResource = rxResource({ stream: () => this.api.getSummary() });
  protected readonly summary = computed(() => (this.summaryResource.hasValue() ? this.summaryResource.value() : null));
  protected readonly summaryFailed = computed(() => this.summaryResource.status() === 'error');
  /** The tiles; the ones that correspond to a queue filter carry it (the others - waiting for us - have no filter in the API). */
  protected readonly tiles = computed<readonly SummaryTile[]>(() => {
    const numbers = this.summary();
    if (numbers === null) {
      return [];
    }
    const tiles: SummaryTile[] = [
      { id: 'open', value: numbers.open, filter: { status: 'Open' } },
      { id: 'underReview', value: numbers.underReview, filter: { status: 'UnderReview' } },
      { id: 'overdue', value: numbers.overdue, filter: { overdue: true } },
      { id: 'highPriority', value: numbers.highPriority, filter: { priority: 'High' } },
      { id: 'needsFollowUp', value: numbers.needsFollowUp, filter: { needsFollowUp: true } },
      { id: 'awaitingAdminReply', value: numbers.awaitingAdminReply, filter: null },
    ];
    return tiles;
  });

  private readonly listResource = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly items = computed<readonly AdminDisputeListItem[]>(() => (this.listResource.hasValue() ? this.listResource.value().items : []));
  protected readonly totalPages = computed(() => (this.listResource.hasValue() ? this.listResource.value().totalPages : 1));
  protected readonly totalCount = computed(() => (this.listResource.hasValue() ? this.listResource.value().totalCount : 0));
  protected readonly isLoading = computed(() => this.listResource.isLoading() && !this.listResource.hasValue());
  protected readonly hasError = computed(() => this.listResource.status() === 'error');
  protected readonly errorKey = computed(() => (this.hasError() ? tutoringAdminErrorKey(this.listResource.error()) : ''));

  protected readonly myId = computed(() => this.auth.currentUser()?.id ?? null);
  protected readonly statusView = disputeStatusView;
  protected readonly flags = rowFlags;

  constructor() {
    trackStudioMeta('tutoring.admin.disputes.pageTitle', 'tutoring.admin.disputes.pageDescription', () => '/admin/tutoring/disputes');
    effect(() => {
      const q = this.query();
      this.form.setValue(
        {
          status: this.statusParam() ?? '',
          category: q.category ?? '',
          flow: q.flow ?? '',
          priority: q.priority ?? '',
          sort: q.sort ?? 'sla',
          q: q.q ?? '',
          overdue: !!q.overdue,
          assignedToMe: !!q.assignedToMe,
          needsFollowUp: !!q.needsFollowUp,
        },
        { emitEvent: false },
      );
    });
  }

  /** Writes the whole filter form to the URL (a default value removes its key, so the address stays short). */
  protected apply(): void {
    const value = this.form.getRawValue();
    this.filters.navigate({
      status: value.status,
      category: value.category,
      flow: value.flow,
      priority: value.priority,
      sort: value.sort === 'sla' ? null : value.sort,
      q: value.q.trim().slice(0, SEARCH_MAX),
      overdue: value.overdue,
      assignedToMe: value.assignedToMe,
      needsFollowUp: value.needsFollowUp,
    });
  }

  /** A summary tile that matches a filter: set it, clearing the others so the tile's number and the list agree. */
  protected applyTile(filter: Readonly<Record<string, string | boolean>>): void {
    this.filters.navigate({ status: null, category: null, flow: null, priority: null, overdue: null, assignedToMe: null, needsFollowUp: null, q: null, tutorId: null, ...filter });
  }

  protected clearTutor(): void {
    this.filters.navigate({ tutorId: null });
  }

  protected clearFilters(): void {
    this.filters.navigate({ status: null, category: null, flow: null, priority: null, sort: null, q: null, overdue: null, assignedToMe: null, needsFollowUp: null, tutorId: null });
  }

  protected goToPage(page: number): void {
    this.filters.navigate({ page: page > 1 ? page : null }, { keepPage: true });
  }

  protected reload(): void {
    this.listResource.reload();
    this.summaryResource.reload();
  }
}
