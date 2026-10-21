import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Pagination } from '../../../../shared/pagination/pagination';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import type { Guid, TutorClassListItem, TutorClassScope } from '../../data/tutoring-classes.models';
import { TutoringClassesApiService } from '../../data/tutoring-classes-api.service';
import { ClassCancelDialog } from '../class-page/class-cancel-dialog/class-cancel-dialog';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { TutorClassCard } from './tutor-class-card/tutor-class-card';

const PAGE_PATH = '/instructor/tutoring/classes';
const PAGE_SIZE = 10;
const SCOPES: readonly TutorClassScope[] = ['upcoming', 'history'];

/**
 * `/instructor/tutoring/classes` - the tutor's classes, upcoming and past, a page at a time (P13-25; contract P13-10 section 7.5). The scope
 * tab and the page live in the URL (`?scope=history&page=2`), so Back returns to the same view. Each card shows what the SERVER says about
 * the class - the status, whether it can be started or completed now, whether a summary is owed, how the room is - and leads to the class
 * page where those actions are carried out; nothing here derives a permission. The route is open to any approved instructor (not only a
 * verified tutor): a suspended tutor still sees the classes pending and can cancel them, and the flags come back `false` for them.
 * The list shows only what a tutor may know about a learner (a nickname and a school grade).
 */
@Component({
  selector: 'app-tutor-classes-page',
  imports: [RouterLink, TranslatePipe, Button, EmptyState, Pagination, Skeleton, TutorPortalNav, TutorClassCard, ClassCancelDialog],
  templateUrl: './tutor-classes-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorClassesPage {
  private readonly api = inject(TutoringClassesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  protected readonly scopes = SCOPES;
  protected readonly scope = computed<TutorClassScope>(() => SCOPES.find((candidate) => candidate === this.query().get('scope')) ?? 'upcoming');
  protected readonly page = computed(() => {
    const requested = Number(this.query().get('page'));
    return Number.isInteger(requested) && requested >= 1 ? requested : 1;
  });

  private readonly classesResource = rxResource({
    params: () => ({ scope: this.scope(), page: this.page() }),
    stream: ({ params }) => this.api.listClasses(params.scope, params.page, PAGE_SIZE),
  });
  protected readonly items = computed<readonly TutorClassListItem[]>(() => (this.classesResource.hasValue() ? this.classesResource.value().items : []));
  protected readonly totalPages = computed(() => (this.classesResource.hasValue() ? this.classesResource.value().totalPages : 1));
  protected readonly totalCount = computed(() => (this.classesResource.hasValue() ? this.classesResource.value().totalCount : 0));
  protected readonly isLoading = computed(() => this.classesResource.isLoading() && !this.classesResource.hasValue());
  protected readonly hasError = computed(() => this.classesResource.status() === 'error');

  /** The class whose cancellation dialog is open (one dialog serves the whole list). */
  protected readonly cancelTarget = signal<Guid | null>(null);
  protected readonly cancelOpen = signal(false);

  constructor() {
    trackStudioMeta('tutoring.tutor.classes.pageTitle', 'tutoring.tutor.classes.pageDescription', () => PAGE_PATH);
  }

  protected chooseScope(next: TutorClassScope): void {
    if (next !== this.scope()) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { scope: next === 'upcoming' ? null : next, page: null }, queryParamsHandling: 'merge' });
    }
  }

  protected goToPage(next: number): void {
    if (next !== this.page()) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { page: next === 1 ? null : next }, queryParamsHandling: 'merge' });
    }
  }

  protected askToCancel(sessionId: Guid): void {
    this.cancelTarget.set(sessionId);
    this.cancelOpen.set(true);
  }

  /** The tutor cancelled a class (the dialog shows the receipt): read the list again so the class leaves "upcoming". */
  protected reload(): void {
    this.classesResource.reload();
  }
}
