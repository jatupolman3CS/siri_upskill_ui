import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { ApiError } from '../../../../core/http/error.interceptor';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { tutoringAdminErrorKey } from '../data/admin-errors';
import { tutorStatusView } from '../data/admin-labels';
import { AdminTutorApiService } from '../data/admin-tutor-api.service';
import type { AdminTutorDetail } from '../data/admin-tutor.models';
import { AdminChip } from '../ui/admin-chip';
import { AdminTutoringNav } from '../ui/admin-tutoring-nav';
import { TutorModerationDialog } from './tutor-moderation-dialog/tutor-moderation-dialog';
import type { ModerationMode } from './tutor-moderation.util';
import { TutorRecordLists } from './tutor-record-lists/tutor-record-lists';

/**
 * `/admin/tutoring/tutors/:tutorId` - one tutor as an administrator sees them (P13-26): state and the reason the tutor was given,
 * performance, commission, and what they teach and have studied. Actions: suspend a verified tutor, reinstate a suspended one,
 * change the commission. Whether an action is allowed is the server's call; the page offers only the ones that fit the current
 * state and shows the server's refusal if the state moved. Listing is read-only here: only the tutor can list themselves (a
 * suspension unlists). Every action returns the tutor as it is now, which replaces the page's copy.
 */
@Component({
  selector: 'app-admin-tutor-page',
  imports: [RouterLink, TranslatePipe, BangkokDatePipe, Button, EmptyState, Skeleton, AdminChip, AdminTutoringNav, TutorModerationDialog, TutorRecordLists],
  templateUrl: './admin-tutor-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTutorPage {
  private readonly api = inject(AdminTutorApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly i18n = inject(TranslationService);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly tutorId = computed(() => this.params().get('tutorId') ?? '');

  private readonly tutorResource = rxResource({
    params: () => this.tutorId(),
    stream: ({ params }) => this.api.getTutor(params),
  });
  protected readonly tutor = linkedSignal<AdminTutorDetail | null>(() => (this.tutorResource.hasValue() ? this.tutorResource.value() : null));
  protected readonly isLoading = computed(() => this.tutorResource.isLoading() && this.tutor() === null);
  protected readonly isMissing = computed(() => {
    const error = this.tutorResource.error();
    return this.tutorResource.status() === 'error' && error instanceof ApiError && error.status === 404;
  });
  protected readonly hasError = computed(() => this.tutorResource.status() === 'error' && !this.isMissing() && this.tutor() === null);
  protected readonly errorKey = computed(() => (this.hasError() ? tutoringAdminErrorKey(this.tutorResource.error()) : ''));

  protected readonly dialogMode = signal<ModerationMode>('suspend');
  protected readonly dialogOpen = signal(false);
  protected readonly statusView = tutorStatusView;

  constructor() {
    trackStudioMeta('tutoring.admin.tutors.detailPageTitle', 'tutoring.admin.tutors.pageDescription', () => `/admin/tutoring/tutors/${this.tutorId()}`);
  }

  protected openDialog(mode: ModerationMode): void {
    this.dialogMode.set(mode);
    this.dialogOpen.set(true);
  }

  protected apply(detail: AdminTutorDetail): void {
    this.tutor.set(detail);
  }

  protected reload(): void {
    this.tutorResource.reload();
  }
}
