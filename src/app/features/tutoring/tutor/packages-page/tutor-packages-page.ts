import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
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
import { tutoringErrorKey } from '../../data/tutoring-errors';
import { curriculumLabelKey, levelLabelKey, localizedName } from '../../data/tutoring-labels';
import type { Guid, TutorPackage } from '../../data/tutoring-packages.models';
import { TutoringPackagesApiService } from '../../data/tutoring-packages-api.service';
import { TutoringTutorApiService } from '../../data/tutoring-tutor-api.service';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { type OfferingChoice, PackageForm } from './package-form/package-form';
import { packageRequest, packageToForm } from '../tutor-package-form.util';

const PAGE_PATH = '/instructor/tutoring/packages';

/** `null` = the editor is closed; `tutorPackage: null` = a new package. */
interface EditorState {
  readonly tutorPackage: TutorPackage | null;
}

/**
 * `/instructor/tutoring/packages` - bundles of lessons sold at a discount (P13-25, P13-12). A tutor creates a package for one
 * of their active subjects, edits its discount and validity, and switches it off to stop new sales (credits already sold stay
 * usable). Every price on the page - total, per lesson, savings - is the server's answer; the page computes none. Behind
 * `verifiedTutorGuard` (packages need a verified tutor; the API's `TutorOnly` policy is the gate).
 */
@Component({
  selector: 'app-tutor-packages-page',
  imports: [RouterLink, NgIcon, TranslatePipe, CurrencyThbPipe, Button, EmptyState, Skeleton, TutorPortalNav, TutorProblem, PackageForm],
  providers: [CurrencyPipe, provideIcons({ phosphorPencilSimple, phosphorPlus })],
  templateUrl: './tutor-packages-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorPackagesPage {
  private readonly api = inject(TutoringPackagesApiService);
  private readonly tutorApi = inject(TutoringTutorApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  private readonly packagesResource = rxResource({ stream: () => this.api.listPackages() });
  private readonly offeringsResource = rxResource({ stream: () => this.tutorApi.listOfferings() });
  private readonly profileResource = rxResource({ stream: () => this.tutorApi.getProfile() });

  protected readonly packages = computed<readonly TutorPackage[]>(() => (this.packagesResource.hasValue() ? this.packagesResource.value() : []));
  protected readonly allowedDurationMinutes = computed<readonly number[] | undefined>(() =>
    this.profileResource.hasValue() ? this.profileResource.value().allowedDurationMinutes : undefined,
  );
  protected readonly isLoading = computed(() => this.packagesResource.isLoading() && !this.packagesResource.hasValue());
  protected readonly hasError = computed(() => this.packagesResource.status() === 'error');

  /** Active subjects only: a package can only be sold for something the tutor currently teaches. */
  protected readonly offeringChoices = computed<readonly OfferingChoice[]>(() => {
    const locale = this.i18n.locale();
    return (this.offeringsResource.hasValue() ? this.offeringsResource.value().items : [])
      .filter((offering) => offering.isActive)
      .map((offering) => ({
        offeringId: offering.offeringId,
        label: [localizedName(offering.subject, locale), this.i18n.t(levelLabelKey(offering.level)), this.i18n.t(curriculumLabelKey(offering.curriculum))].join(' - '),
      }));
  });
  protected readonly noOffering = computed(() => this.offeringsResource.hasValue() && this.offeringChoices().length === 0);

  protected readonly editor = signal<EditorState | null>(null);
  protected readonly busyId = signal<Guid | null>(null);
  protected readonly problem = signal<string | null>(null);
  private opener: HTMLElement | null = null;

  protected readonly levelKey = levelLabelKey;
  protected readonly curriculumKey = curriculumLabelKey;

  constructor() {
    trackStudioMeta('tutoring.tutor.packages.pageTitle', 'tutoring.tutor.packages.pageDescription', () => PAGE_PATH);
  }

  protected subjectName(tutorPackage: TutorPackage): string {
    return localizedName({ nameTh: tutorPackage.offering.subjectNameTh, nameEn: tutorPackage.offering.subjectNameEn }, this.i18n.locale());
  }

  protected reload(): void {
    this.packagesResource.reload();
    this.offeringsResource.reload();
    this.profileResource.reload();
  }

  protected openEditor(tutorPackage: TutorPackage | null, event?: Event): void {
    this.opener = (event?.currentTarget as HTMLElement | undefined) ?? null;
    this.problem.set(null);
    this.editor.set({ tutorPackage });
    afterNextRender(() => document.getElementById('tutor-package-editor')?.focus(), { injector: this.injector });
  }

  protected closeEditor(): void {
    this.editor.set(null);
    const opener = this.opener;
    this.opener = null;
    afterNextRender(
      () => {
        // `<app-button>` is only the host of the real button: focus the button inside it.
        const host = opener?.isConnected ? opener : document.getElementById('tutor-package-add');
        (host instanceof HTMLButtonElement ? host : host?.querySelector('button'))?.focus();
      },
      { injector: this.injector },
    );
  }

  protected onSaved(): void {
    this.packagesResource.reload();
    this.closeEditor();
  }

  /** Stops new sales of a package. Credits that were already sold stay usable (the server says so; so does the confirmation text). */
  protected deactivate(tutorPackage: TutorPackage): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(tutorPackage.packageId);
    this.problem.set(null);
    this.api.deactivatePackage(tutorPackage.packageId).subscribe({
      next: () => this.afterToggle('tutoring.tutor.packages.deactivated'),
      error: (error: unknown) => this.failToggle(error),
    });
  }

  /** Re-opens a switched-off package: the same values with `isActive` true (the server re-checks the limit and duplicates). */
  protected activate(tutorPackage: TutorPackage): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(tutorPackage.packageId);
    this.problem.set(null);
    this.api.updatePackage(tutorPackage.packageId, packageRequest({ ...packageToForm(tutorPackage), isActive: true })).subscribe({
      next: () => this.afterToggle('tutoring.tutor.packages.activated'),
      error: (error: unknown) => this.failToggle(error),
    });
  }

  private afterToggle(messageKey: string): void {
    this.busyId.set(null);
    this.packagesResource.reload();
    this.toast.success(this.i18n.t(messageKey));
  }

  private failToggle(error: unknown): void {
    this.busyId.set(null);
    this.problem.set(this.i18n.t(tutoringErrorKey(error)));
  }
}
