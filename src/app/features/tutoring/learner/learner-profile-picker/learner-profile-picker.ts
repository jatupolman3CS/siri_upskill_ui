import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorPlus } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { SelectField, type SelectOption } from '../../../../shared/select/select';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { gradeLabelKey } from '../../data/tutoring-labels';
import { TutoringLearnerApiService } from '../../data/tutoring-learner-api.service';
import type { LearnerProfile } from '../../data/tutoring-learner.models';
import { LearnerProfileForm } from '../learner-profile-form/learner-profile-form';

/**
 * "Who is this for?" - the learner profile (nickname + school grade) of the signed-in account that a purchase is made for. Reads the
 * account's profiles itself, picks the only one there is for the person (with several they choose: a wrong default buys for the wrong
 * child), and lets them add one without leaving the page. The chosen profile is the two-way `profile`; it is `null` until one is chosen.
 * The server re-checks that the profile is the caller's and active when the purchase is made.
 */
@Component({
  selector: 'app-learner-profile-picker',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, Button, SelectField, Skeleton, LearnerProfileForm],
  templateUrl: './learner-profile-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorPlus })],
  host: { class: 'flex flex-col gap-4' },
})
export class LearnerProfilePicker {
  private readonly api = inject(TutoringLearnerApiService);
  private readonly i18n = inject(TranslationService);

  /** The chosen learner profile (two-way), or `null`. */
  readonly profile = model<LearnerProfile | null>(null);

  private readonly profilesResource = rxResource({ stream: () => this.api.listLearnerProfiles() });
  private readonly created = signal<readonly LearnerProfile[]>([]);
  protected readonly profiles = computed<readonly LearnerProfile[]>(() => {
    const loaded = this.profilesResource.hasValue() ? this.profilesResource.value().items : [];
    const known = new Set(loaded.map((profile) => profile.learnerProfileId));
    return [...loaded, ...this.created().filter((profile) => !known.has(profile.learnerProfileId))];
  });
  protected readonly loading = computed(() => this.profilesResource.isLoading() && !this.profilesResource.hasValue());
  protected readonly failed = computed(() => this.profilesResource.status() === 'error');

  protected readonly control = new FormControl('', { nonNullable: true });
  private readonly chosenId = toSignal(this.control.valueChanges, { initialValue: '' });
  protected readonly options = computed<SelectOption[]>(() =>
    this.profiles().map((profile) => ({
      value: profile.learnerProfileId,
      label: `${profile.nickname} - ${this.i18n.t(gradeLabelKey(profile.gradeLevel))}`,
    })),
  );

  /** The inline "add a learner" form shows by default when the account has none yet. */
  private readonly addRequested = signal(false);
  protected readonly adding = computed(() => this.addRequested() || (this.profilesResource.hasValue() && this.profiles().length === 0));

  constructor() {
    // The only profile there is gets picked for the person.
    effect(() => {
      const only = this.profiles().length === 1 ? this.profiles()[0] : undefined;
      if (only !== undefined && untracked(() => this.control.value) === '') {
        this.control.setValue(only.learnerProfileId);
      }
    });

    effect(() => {
      const id = this.chosenId();
      const found = this.profiles().find((profile) => profile.learnerProfileId === id) ?? null;
      untracked(() => this.profile.set(found));
    });
  }

  /** The server said the chosen profile is gone or not the caller's: forget it and read the list again. */
  forgetAndReload(): void {
    this.control.setValue('');
    this.profilesResource.reload();
  }

  protected showForm(): void {
    this.addRequested.set(true);
  }

  protected hideForm(): void {
    this.addRequested.set(false);
  }

  protected onCreated(profile: LearnerProfile): void {
    this.created.update((list) => [...list, profile]);
    this.profilesResource.reload();
    this.addRequested.set(false);
    this.control.setValue(profile.learnerProfileId);
  }

  protected retry(): void {
    this.profilesResource.reload();
  }
}
