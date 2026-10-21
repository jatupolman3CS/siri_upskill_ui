import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorPencilSimple, phosphorPlus } from '@ng-icons/phosphor-icons/regular';

import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { curriculumLabelKey, levelLabelKey, localizedName } from '../../data/tutoring-labels';
import { tutoringErrorKey } from '../../data/tutoring-errors';
import { TutoringPublicApiService } from '../../data/tutoring-public-api.service';
import { TutoringTutorApiService } from '../../data/tutoring-tutor-api.service';
import type { Guid, TutorOffering } from '../../data/tutoring-tutor.models';
import { type SubjectChoice, selectableSubjects, subjectChoicesOf } from '../tutor-offering-form.util';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { OfferingForm } from './offering-form/offering-form';

const PAGE_PATH = '/instructor/tutoring/offerings';

/** `null` = the editor is closed; `offering: null` = a new offering. */
interface EditorState {
  readonly offering: TutorOffering | null;
}

/**
 * `/instructor/tutoring/offerings` - what the tutor teaches and for how much (P13-24). Offerings are never deleted (past and
 * future bookings point at them): a tutor pauses one instead. Prices are the tutor's own input and are displayed only; every
 * charge is computed by the server from the stored offering at booking time. Reachable before verification - a tutor needs
 * an active offering to be allowed to submit for review.
 */
@Component({
  selector: 'app-tutor-offerings-page',
  imports: [NgIcon, TranslatePipe, CurrencyThbPipe, Button, EmptyState, Skeleton, TutorPortalNav, TutorProblem, OfferingForm],
  providers: [CurrencyPipe, provideIcons({ phosphorPencilSimple, phosphorPlus })],
  templateUrl: './tutor-offerings-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorOfferingsPage {
  private readonly api = inject(TutoringTutorApiService);
  private readonly publicApi = inject(TutoringPublicApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  private readonly offeringsResource = rxResource({ stream: () => this.api.listOfferings() });
  private readonly subjectsResource = rxResource({ stream: () => this.publicApi.listSubjects() });

  protected readonly offerings = computed<readonly TutorOffering[]>(() => (this.offeringsResource.hasValue() ? this.offeringsResource.value().items : []));
  protected readonly isLoading = computed(() => this.offeringsResource.isLoading() && !this.offeringsResource.hasValue());
  protected readonly hasError = computed(() => this.offeringsResource.status() === 'error');

  /** The subject select: the active catalogue grouped by parent, plus any retired subject an existing offering still uses (shown, not pickable). */
  protected readonly subjectChoices = computed<readonly SubjectChoice[]>(() => {
    const catalogue = this.subjectsResource.hasValue() ? this.subjectsResource.value().items : [];
    return subjectChoicesOf(selectableSubjects(catalogue, this.offerings()), this.i18n.locale());
  });
  /** Nothing a NEW offering can pick (the list failed to load, or the catalogue is empty): the editor says so instead of showing a dead select. */
  protected readonly subjectsUnavailable = computed(
    () =>
      !this.subjectChoices().some((choice) => choice.disabled !== true) && !this.offeringsResource.isLoading() && !this.subjectsResource.isLoading(),
  );

  protected readonly editor = signal<EditorState | null>(null);
  protected readonly busyId = signal<Guid | null>(null);
  protected readonly problem = signal<string | null>(null);
  private opener: HTMLElement | null = null;

  constructor() {
    trackStudioMeta('tutoring.tutor.offerings.pageTitle', 'tutoring.tutor.offerings.pageDescription', () => PAGE_PATH);
  }

  protected readonly levelKey = levelLabelKey;
  protected readonly curriculumKey = curriculumLabelKey;
  protected subjectName(offering: TutorOffering): string {
    return localizedName(offering.subject, this.i18n.locale());
  }

  protected reload(): void {
    this.offeringsResource.reload();
    this.subjectsResource.reload();
  }

  protected openEditor(offering: TutorOffering | null, event?: Event): void {
    this.opener = (event?.currentTarget as HTMLElement | undefined) ?? null;
    this.problem.set(null);
    this.editor.set({ offering });
    afterNextRender(() => document.getElementById('tutor-offering-editor')?.focus(), { injector: this.injector });
  }

  protected closeEditor(): void {
    this.editor.set(null);
    const opener = this.opener;
    this.opener = null;
    afterNextRender(
      () => {
        // `<app-button>` is only the host of the real button: focus the button inside it.
        const host = opener?.isConnected ? opener : document.getElementById('tutor-offering-add');
        (host instanceof HTMLButtonElement ? host : host?.querySelector('button'))?.focus();
      },
      { injector: this.injector },
    );
  }

  protected onSaved(): void {
    this.offeringsResource.reload();
    this.closeEditor();
  }

  /** The server reported the identical paused offering: close the form and open that offering for editing instead. */
  protected reopen(offeringId: Guid): void {
    const target = this.offerings().find((offering) => offering.offeringId === offeringId) ?? null;
    if (target !== null) {
      this.openEditor(target);
    } else {
      this.closeEditor();
    }
  }

  /** Pauses or resumes an offering without opening the editor (same values, only `isActive` flips). */
  protected toggleActive(offering: TutorOffering): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(offering.offeringId);
    this.problem.set(null);
    this.api
      .updateOffering(offering.offeringId, {
        subjectId: offering.subject.subjectId,
        level: offering.level,
        curriculum: offering.curriculum,
        hourlyRateOneOnOne: offering.hourlyRateOneOnOne,
        groupHourlyRatePerSeat: offering.groupHourlyRatePerSeat,
        groupMaxSeats: offering.groupMaxSeats,
        trialEnabled: offering.trialEnabled,
        trialMinutes: offering.trialMinutes,
        trialPrice: offering.trialPrice,
        isActive: !offering.isActive,
      })
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.offeringsResource.reload();
          this.toast.success(this.i18n.t(offering.isActive ? 'tutoring.tutor.offerings.paused' : 'tutoring.tutor.offerings.resumed'));
        },
        error: (error: unknown) => {
          this.busyId.set(null);
          this.problem.set(this.i18n.t(tutoringErrorKey(error)));
        },
      });
  }
}
