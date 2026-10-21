import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { ApiError } from '../../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import type { AvailabilitySettings, TutorAvailability } from '../../data/tutoring-availability.models';
import { TutoringAvailabilityApiService } from '../../data/tutoring-availability-api.service';
import { TutoringTutorApiService } from '../../data/tutoring-tutor-api.service';
import type { TutorOffering } from '../../data/tutoring-tutor.models';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { AvailabilityExceptions } from './availability-exceptions/availability-exceptions';
import { AvailabilityPreview } from './availability-preview/availability-preview';
import { AvailabilitySettingsForm } from './availability-settings-form/availability-settings-form';
import { WeeklyRulesEditor } from './weekly-rules-editor/weekly-rules-editor';

const PAGE_PATH = '/instructor/tutoring/availability';

/**
 * `/instructor/tutoring/availability` - when a verified tutor can be booked (P13-25): the weekly hours, one-off exceptions, the
 * booking rules (notice, rest after class, how far ahead), and a preview of what learners see. Every figure shown or saved is
 * the server's: the page edits inputs of the slot calculator and then asks the public slot endpoint what actually results.
 * Sits behind `verifiedTutorGuard` (a courtesy - the API's `TutorOnly` policy is the gate).
 */
@Component({
  selector: 'app-tutor-availability-page',
  imports: [
    RouterLink,
    TranslatePipe,
    Button,
    EmptyState,
    Skeleton,
    TutorPortalNav,
    AvailabilitySettingsForm,
    WeeklyRulesEditor,
    AvailabilityExceptions,
    AvailabilityPreview,
  ],
  templateUrl: './tutor-availability-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorAvailabilityPage {
  private readonly availabilityApi = inject(TutoringAvailabilityApiService);
  private readonly tutorApi = inject(TutoringTutorApiService);

  private readonly availabilityResource = rxResource({ stream: () => this.availabilityApi.getAvailability() });
  /** Only the public slug, the listing flag and the active subjects are needed (for the preview); a failure there hides the preview, nothing more. */
  private readonly profileResource = rxResource({ stream: () => this.tutorApi.getProfile() });
  private readonly offeringsResource = rxResource({ stream: () => this.tutorApi.listOfferings() });

  /** The stored availability; replaced by each save's own answer so the page never needs a second GET. */
  protected readonly availability = linkedSignal<TutorAvailability | null>(() => (this.availabilityResource.hasValue() ? this.availabilityResource.value() : null));
  protected readonly isLoading = computed(() => this.availabilityResource.isLoading() && !this.availabilityResource.hasValue());
  protected readonly hasError = computed(() => this.availabilityResource.status() === 'error');
  protected readonly notVerified = computed(() => {
    const error = this.availabilityResource.error();
    return error instanceof ApiError && (error.status === 403 || error.status === 404);
  });

  protected readonly profile = computed(() => (this.profileResource.hasValue() ? this.profileResource.value() : null));
  protected readonly activeOfferings = computed<readonly TutorOffering[]>(() =>
    this.offeringsResource.hasValue() ? this.offeringsResource.value().items.filter((offering) => offering.isActive) : [],
  );
  protected readonly previewReady = computed(() => this.profile() !== null && this.offeringsResource.hasValue());
  protected readonly previewRefresh = signal(0);

  constructor() {
    trackStudioMeta('tutoring.tutor.availability.pageTitle', 'tutoring.tutor.availability.pageDescription', () => PAGE_PATH);
  }

  protected reload(): void {
    this.availabilityResource.reload();
    this.profileResource.reload();
    this.offeringsResource.reload();
    this.bumpPreview();
  }

  protected onRulesSaved(next: TutorAvailability): void {
    this.availability.set(next);
    this.bumpPreview();
  }

  protected onSettingsSaved(settings: AvailabilitySettings): void {
    this.availability.update((current) => (current === null ? current : { ...current, settings }));
    this.bumpPreview();
  }

  protected bumpPreview(): void {
    this.previewRefresh.update((value) => value + 1);
  }
}
