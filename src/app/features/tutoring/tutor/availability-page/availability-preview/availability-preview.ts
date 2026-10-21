import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { SelectField, type SelectOption } from '../../../../../shared/select/select';
import { addDaysToDate } from '../../../../live/data/live-instructor.util';
import { bangkokDateOf, slotWindowRange } from '../../../data/tutor-slots.util';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { curriculumLabelKey, levelLabelKey, localizedName } from '../../../data/tutoring-labels';
import { TutoringPublicApiService } from '../../../data/tutoring-public-api.service';
import type { TutorSlot } from '../../../data/tutoring-public.models';
import type { TutorOffering } from '../../../data/tutoring-tutor.models';
import { SlotPicker } from '../../../ui/slot-picker/slot-picker';

const WINDOW_DAYS = 7;
const FALLBACK_MAX_ADVANCE_DAYS = 60;

/**
 * "What learners will see" (P13-25): the PUBLIC slot list of the tutor, rendered with the same picker the booking page uses,
 * for one subject and one lesson length. It calls the public `GET /tutoring/tutors/{slug}/slots` endpoint, so it shows exactly
 * what the server's slot calculator offers right now - after the weekly hours, exceptions, notice, buffer and everything already
 * booked. Nothing here books anything. A tutor whose profile is not listed has no public slots (the endpoint answers 404 for
 * every non-public state), so that case is explained instead of called.
 */
@Component({
  selector: 'app-availability-preview',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, SelectField, SlotPicker],
  templateUrl: './availability-preview.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AvailabilityPreview {
  private readonly api = inject(TutoringPublicApiService);
  private readonly i18n = inject(TranslationService);

  /** The tutor's own public slug. */
  readonly slug = input.required<string>();
  /** Active subjects only (a paused one cannot be booked, so it has no public slots). */
  readonly offerings = input.required<readonly TutorOffering[]>();
  /** Allowed class durations from tutor availability. */
  readonly allowedDurationMinutes = input<readonly number[] | undefined>(undefined);
  /** Whether the profile is listed publicly; if not, there is nothing public to preview. */
  readonly listed = input.required<boolean>();
  /** Bumped by the page whenever the availability changed, so the preview refetches. */
  readonly refresh = input(0);

  protected readonly offeringControl = new FormControl('', { nonNullable: true });
  protected readonly durationControl = new FormControl('60', { nonNullable: true });
  private readonly offeringId = toSignal(this.offeringControl.valueChanges.pipe(startWith(this.offeringControl.value)), { requireSync: true });
  private readonly duration = toSignal(this.durationControl.valueChanges.pipe(startWith(this.durationControl.value)), { requireSync: true });

  protected readonly weekIndex = signal(0);
  protected readonly selected = signal<TutorSlot | null>(null);
  private readonly today = bangkokDateOf(Date.now());

  protected readonly offeringOptions = computed<readonly SelectOption[]>(() =>
    this.offerings().map((offering) => ({
      value: offering.offeringId,
      label: [
        localizedName(offering.subject, this.i18n.locale()),
        this.i18n.t(levelLabelKey(offering.level)),
        this.i18n.t(curriculumLabelKey(offering.curriculum)),
      ].join(' - '),
    })),
  );
  protected readonly durationOptions = computed<readonly SelectOption[]>(() => {
    const durations = this.allowedDurationMinutes() ?? [30, 60, 90, 120];
    return durations.map((minutes) => ({
      value: String(minutes),
      label: this.i18n.t('tutoring.tutor.availability.preview.durationOption', { minutes }),
    }));
  });

  protected readonly windowStart = computed(() => addDaysToDate(this.today, this.weekIndex() * WINDOW_DAYS) ?? this.today);
  protected readonly canPreview = computed(() => this.listed() && this.offerings().length > 0 && this.offeringId() !== '');

  protected readonly slotsResource = rxResource({
    params: () => {
      const range = slotWindowRange(this.windowStart(), WINDOW_DAYS);
      if (!this.canPreview() || range === null) {
        return undefined;
      }
      return {
        slug: this.slug(),
        refresh: this.refresh(),
        query: { offeringId: this.offeringId(), from: range.fromUtc, to: range.toUtc, durationMinutes: Number(this.duration()) },
      };
    },
    stream: ({ params }) => this.api.getTutorSlots(params.slug, params.query),
  });
  private readonly response = computed(() => (this.slotsResource.hasValue() ? this.slotsResource.value() : null));
  protected readonly slots = computed(() => this.response()?.slots ?? []);
  protected readonly loading = computed(() => this.slotsResource.status() === 'idle' || this.slotsResource.status() === 'loading');
  protected readonly failed = computed(() => this.slotsResource.status() === 'error');
  protected readonly errorMessage = computed(() => this.i18n.t(tutoringErrorKey(this.slotsResource.error() as ApiError | undefined)));
  protected readonly canGoPrevious = computed(() => this.weekIndex() > 0);
  protected readonly canGoNext = computed(() => (this.weekIndex() + 1) * WINDOW_DAYS <= (this.response()?.maxAdvanceDays ?? FALLBACK_MAX_ADVANCE_DAYS));

  constructor() {
    // Keep a valid subject selected: the first active one, and again whenever the list changes under the current choice.
    effect(() => {
      const list = this.offerings();
      untracked(() => {
        if (!list.some((offering) => offering.offeringId === this.offeringControl.value)) {
          this.offeringControl.setValue(list.at(0)?.offeringId ?? '');
        }
      });
    });

    // Keep a valid duration selected: the first allowed one if the current choice is not in the list.
    effect(() => {
      const durations = this.allowedDurationMinutes() ?? [30, 60, 90, 120];
      untracked(() => {
        if (!durations.map(String).includes(this.durationControl.value)) {
          this.durationControl.setValue(String(durations[0] ?? 60));
        }
      });
    });
  }

  protected previousWeek(): void {
    this.weekIndex.update((index) => Math.max(0, index - 1));
  }

  protected nextWeek(): void {
    this.weekIndex.update((index) => index + 1);
  }

  protected retry(): void {
    this.slotsResource.reload();
  }
}
