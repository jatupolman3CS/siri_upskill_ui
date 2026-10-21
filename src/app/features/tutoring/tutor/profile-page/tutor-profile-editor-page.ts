import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';

import { ApiError } from '../../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Button } from '../../../../shared/button/button';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { InputField } from '../../../../shared/input/input';
import { SelectField, type SelectOption } from '../../../../shared/select/select';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ToastService } from '../../../../shared/toast/toast.service';
import { trackStudioMeta } from '../../../live/instructor/studio-meta';
import { tutoringErrorKey, tutoringReasonOf } from '../../data/tutoring-errors';
import { TutoringTutorApiService } from '../../data/tutoring-tutor-api.service';
import type { TutorGender } from '../../data/tutoring-public.models';
import { genderLabelKey } from '../../data/tutoring-labels';
import { TUTOR_GENDERS } from '../../data/tutor-search-query.util';
import type { TutorProfile } from '../../data/tutoring-tutor.models';
import { FieldFeedback, focusFirstInvalid, serverRejectedFields } from '../../ui/tutor-form.util';
import {
  PROFILE_LIMITS,
  PROFILE_PROPERTY_TO_FIELD,
  type ProfileField,
  type ProfileFormValue,
  profileRequest,
  profileToForm,
  validateProfile,
} from '../tutor-profile-form.util';
import { TutorPortalNav } from '../ui/tutor-portal-nav/tutor-portal-nav';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { TutorStatusBadge } from '../ui/tutor-status-badge/tutor-status-badge';
import { IntroVideoPanel } from './intro-video-panel/intro-video-panel';
import { PhotoPanel } from './photo-panel/photo-panel';

const PAGE_PATH = '/instructor/tutoring/profile';

/**
 * `/instructor/tutoring/profile` - create and edit the tutor profile (P13-24). One page for both: while the server answers
 * `404 tutoring.tutor_profile_not_found` it is the create form, afterwards the editor, with the photo and the intro video
 * beside it. Reachable before verification; a suspended profile is read-only (the server refuses edits then too).
 *
 * Every write carries the `rowVersion` of the latest read. A photo or video change also rotates it, so those panels ask this
 * page to reload; the form itself is only overwritten from the server while it has no unsaved edits.
 */
@Component({
  selector: 'app-tutor-profile-editor-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    Button,
    EmptyState,
    InputField,
    SelectField,
    Skeleton,
    TutorPortalNav,
    TutorProblem,
    TutorStatusBadge,
    PhotoPanel,
    IntroVideoPanel,
  ],
  templateUrl: './tutor-profile-editor-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorProfileEditorPage {
  private readonly api = inject(TutoringTutorApiService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(TranslationService);

  private readonly profileResource = rxResource({ stream: () => this.api.getProfile() });
  protected readonly profile = computed<TutorProfile | null>(() => (this.profileResource.hasValue() ? this.profileResource.value() : null));
  protected readonly isCreate = computed(() => {
    const error = this.profileResource.error();
    return !this.profileResource.hasValue() && error instanceof ApiError && tutoringReasonOf(error) === 'tutoring.tutor_profile_not_found';
  });
  protected readonly isLoading = computed(() => this.profileResource.isLoading() && !this.profileResource.hasValue());
  protected readonly hasError = computed(() => this.profileResource.status() === 'error' && !this.isCreate());
  protected readonly suspended = computed(() => this.profile()?.status === 'Suspended');

  protected readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true }),
    headline: new FormControl('', { nonNullable: true }),
    bio: new FormControl('', { nonNullable: true }),
    gender: new FormControl<TutorGender>('Undisclosed', { nonNullable: true }),
    yearsExperience: new FormControl('0', { nonNullable: true }),
  });
  private readonly value = toSignal<ProfileFormValue>(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly issues = computed(() => validateProfile(this.value()));
  protected readonly feedback = new FieldFeedback<ProfileField>();
  private readonly serverRejected = signal<ReadonlySet<ProfileField>>(new Set());

  protected readonly limits = PROFILE_LIMITS;
  protected readonly bioLength = computed(() => this.value().bio.length);
  protected readonly genderOptions = computed<readonly SelectOption[]>(() =>
    TUTOR_GENDERS.map((gender) => ({ value: gender, label: this.i18n.t(genderLabelKey(gender)) })),
  );

  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly stale = signal(false);
  /** The token of the newest server copy; kept apart from the form so a photo change can refresh it mid-edit. */
  private readonly rowVersion = signal('');
  private readonly formRoot = viewChild<ElementRef<HTMLElement>>('formRoot');

  constructor() {
    trackStudioMeta('tutoring.tutor.profile.pageTitle', 'tutoring.tutor.profile.pageDescription', () => PAGE_PATH);

    effect(() => {
      const profile = this.profile();
      if (profile === null) {
        return;
      }
      untracked(() => {
        this.rowVersion.set(profile.rowVersion);
        if (this.form.pristine) {
          this.form.reset(profileToForm(profile));
        }
        if (profile.status === 'Suspended') {
          this.form.disable({ emitEvent: false });
        }
      });
    });
  }

  protected message(field: ProfileField): string | undefined {
    return this.feedback.messageFor(field, this.issues(), this.i18n, this.serverRejected());
  }

  protected reload(): void {
    this.profileResource.reload();
  }

  /** Discards the unsaved edits and takes the server's copy (offered after a `409 tutoring.concurrent_update`). */
  protected loadLatest(): void {
    this.stale.set(false);
    this.problem.set(null);
    this.form.markAsPristine();
    this.profileResource.reload();
  }

  protected save(): void {
    if (this.saving() || this.suspended()) {
      return;
    }
    this.feedback.attempt();
    this.serverRejected.set(new Set());
    if (Object.keys(this.issues()).length > 0) {
      this.problem.set(null);
      afterNextRender(() => focusFirstInvalid(this.formRoot()?.nativeElement), { injector: this.injector });
      return;
    }

    const body = profileRequest(this.form.getRawValue());
    const existing = this.profile();
    this.saving.set(true);
    this.problem.set(null);
    const request = existing
      ? this.api.updateProfile({ ...body, rowVersion: this.rowVersion() })
      : this.api.createProfile(body);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.profileResource.set(saved);
        this.feedback.reset();
        this.toast.success(this.i18n.t(existing ? 'tutoring.tutor.profile.saved' : 'tutoring.tutor.profile.created'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverRejected.set(serverRejectedFields(error, PROFILE_PROPERTY_TO_FIELD));
        this.stale.set(tutoringReasonOf(error) === 'tutoring.concurrent_update');
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
