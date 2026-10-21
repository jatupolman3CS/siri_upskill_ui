import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorPencilSimple, phosphorPlus, phosphorTrash, phosphorUserCircle } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { setPageMeta } from '../../../../core/seo/page-meta';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { Modal } from '../../../../shared/modal/modal';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { tutoringErrorKey, tutoringProblemOf } from '../../data/tutoring-errors';
import { gradeLabelKey } from '../../data/tutoring-labels';
import { TutoringLearnerApiService } from '../../data/tutoring-learner-api.service';
import type { LearnerProfile } from '../../data/tutoring-learner.models';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { LearnerProfileForm } from '../learner-profile-form/learner-profile-form';

/** `null` = the editor is closed; `profile: null` = a new profile. */
interface EditorState {
  readonly profile: LearnerProfile | null;
}

/**
 * `/account/learner-profiles` (P13-22) - the people a signed-in account books lessons for. A profile is a nickname and a
 * school grade, nothing else; tutors see only those two fields. A profile is switched off (not erased) so a lesson booked for
 * it earlier keeps its label, and the server refuses to switch one off while it has a live booking.
 * <para>
 * The account may hold ten active profiles (server option). Everything the server decides - that limit, consent validity, the
 * "in use" check - is shown as the server answered.
 * </para>
 */
@Component({
  selector: 'app-learner-profiles-page',
  imports: [FormsModule, RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, Button, EmptyState, Modal, Skeleton, TutorProblem, LearnerProfileForm],
  providers: [provideIcons({ phosphorPencilSimple, phosphorPlus, phosphorTrash, phosphorUserCircle })],
  templateUrl: './learner-profiles-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnerProfilesPage {
  private readonly api = inject(TutoringLearnerApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  private readonly profilesResource = rxResource({ stream: () => this.api.listLearnerProfiles() });
  protected readonly profiles = computed<readonly LearnerProfile[]>(() => (this.profilesResource.hasValue() ? this.profilesResource.value().items : []));
  protected readonly isLoading = computed(() => this.profilesResource.isLoading() && !this.profilesResource.hasValue());
  protected readonly hasError = computed(() => this.profilesResource.status() === 'error');

  protected readonly editor = signal<EditorState | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly pendingDeactivation = signal<LearnerProfile | null>(null);
  protected readonly deactivating = signal(false);
  protected readonly problem = signal<string | null>(null);
  private opener: HTMLElement | null = null;

  protected readonly withdrawModalOpen = signal(false);
  protected readonly pendingWithdrawal = signal<LearnerProfile | null>(null);
  protected withdrawConfirmation = '';
  protected readonly withdrawing = signal(false);
  protected readonly withdrawProblem = signal<string | null>(null);
  protected readonly withdrawBlockers = signal<readonly string[]>([]);

  protected readonly gradeKey = gradeLabelKey;

  constructor() {
    setPageMeta({
      title: `${this.i18n.t('tutoring.learner.pageTitle')} | ${this.i18n.t('common.appName')}`,
      description: this.i18n.t('tutoring.learner.pageDescription'),
      robots: 'noindex',
    });
  }

  protected isAnonymized(profile: LearnerProfile): boolean {
    return Boolean(profile.anonymizedAtUtc) || Boolean(profile.guardianConsentWithdrawnAtUtc);
  }

  protected isConsentWithdrawn(profile: LearnerProfile): boolean {
    return Boolean(profile.guardianConsentWithdrawnAtUtc);
  }

  protected reload(): void {
    this.profilesResource.reload();
  }

  protected openEditor(profile: LearnerProfile | null, event?: Event): void {
    this.opener = (event?.currentTarget as HTMLElement | undefined) ?? null;
    this.problem.set(null);
    this.editor.set({ profile });
    afterNextRender(() => document.getElementById('learner-profile-editor')?.focus(), { injector: this.injector });
  }

  protected closeEditor(): void {
    this.editor.set(null);
    const opener = this.opener;
    this.opener = null;
    afterNextRender(
      () => {
        // `<app-button>` is only the host of the real button: focus the button inside it.
        const host = opener?.isConnected ? opener : document.getElementById('learner-profile-add');
        (host instanceof HTMLButtonElement ? host : host?.querySelector('button'))?.focus();
      },
      { injector: this.injector },
    );
  }

  protected onSaved(): void {
    this.profilesResource.reload();
    this.closeEditor();
  }

  protected askDeactivate(profile: LearnerProfile): void {
    this.problem.set(null);
    this.pendingDeactivation.set(profile);
    this.confirmOpen.set(true);
  }

  protected confirmDeactivate(): void {
    const profile = this.pendingDeactivation();
    if (profile === null || this.deactivating()) {
      return;
    }
    this.deactivating.set(true);
    this.api.deactivateLearnerProfile(profile.learnerProfileId).subscribe({
      next: () => {
        this.deactivating.set(false);
        this.confirmOpen.set(false);
        this.pendingDeactivation.set(null);
        this.profilesResource.reload();
        this.toast.success(this.i18n.t('tutoring.learner.deactivated'));
      },
      error: (error: unknown) => {
        this.deactivating.set(false);
        this.confirmOpen.set(false);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }

  protected askWithdrawConsent(profile: LearnerProfile): void {
    this.withdrawProblem.set(null);
    this.withdrawBlockers.set([]);
    this.withdrawConfirmation = '';
    this.pendingWithdrawal.set(profile);
    this.withdrawModalOpen.set(true);
  }

  protected closeWithdrawModal(): void {
    this.withdrawModalOpen.set(false);
    this.pendingWithdrawal.set(null);
    this.withdrawProblem.set(null);
    this.withdrawBlockers.set([]);
    this.withdrawConfirmation = '';
  }

  protected confirmWithdrawConsent(): void {
    const profile = this.pendingWithdrawal();
    if (profile === null || this.withdrawing() || this.withdrawConfirmation.trim().toUpperCase() !== 'WITHDRAW') {
      return;
    }
    this.withdrawing.set(true);
    this.withdrawProblem.set(null);
    this.withdrawBlockers.set([]);
    this.api.withdrawGuardianConsent(profile.learnerProfileId, { confirmation: 'WITHDRAW' }).subscribe({
      next: () => {
        this.withdrawing.set(false);
        this.closeWithdrawModal();
        this.profilesResource.reload();
        this.toast.success(this.i18n.t('tutoring.learner.profile.consentWithdraw.success'));
      },
      error: (error: unknown) => {
        this.withdrawing.set(false);
        const problem = tutoringProblemOf(error);
        if (problem?.blockers && problem.blockers.length > 0) {
          this.withdrawBlockers.set(problem.blockers);
        } else {
          this.withdrawProblem.set(this.i18n.t(tutoringErrorKey(error)));
        }
      },
    });
  }
}
