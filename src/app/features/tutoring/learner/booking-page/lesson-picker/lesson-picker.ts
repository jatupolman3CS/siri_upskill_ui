import { CurrencyPipe, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Checkbox } from '../../../../../shared/checkbox/checkbox';
import { SelectField, type SelectOption } from '../../../../../shared/select/select';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { addDaysToDate } from '../../../../live/data/live-instructor.util';
import { allowedDurationsOf, findSlotStartingAt, initialDurationOf, initialWeekIndex, PREFERRED_DURATION_MINUTES, type BookingPreselection } from '../../../data/tutoring-booking.util';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { curriculumLabelKey, formatLabelKey, levelLabelKey, localizedName } from '../../../data/tutoring-labels';
import { TutoringPublicApiService } from '../../../data/tutoring-public-api.service';
import type { Guid, PublicOffering, SessionFormat, TutorPublicProfile, TutorQuote, TutorSlot } from '../../../data/tutoring-public.models';
import { bangkokDateOf, slotWindowRange } from '../../../data/tutor-slots.util';
import { startVisibleInterval } from '../../../data/visible-interval';
import { SlotPicker } from '../../../ui/slot-picker/slot-picker';

const WINDOW_DAYS = 7;
/** Refresh the calendar every minute so a time someone else just took does not linger. */
const SLOT_REFRESH_MS = 60_000;

/** A complete, bookable choice: what the page sends to the server (it re-validates and re-prices all of it). */
export interface LessonSelection {
  readonly offeringId: Guid;
  readonly format: SessionFormat;
  readonly isTrial: boolean;
  readonly durationMinutes: number;
  readonly slot: TutorSlot;
  /** The server's display quote for this offering / format / length - shown, never recomputed. */
  readonly quote: TutorQuote;
}

/**
 * The lesson step of the booking page: offering, format (one-to-one / small group), trial, length and a time from the tutor's
 * real calendar. Starts from the pre-selection handed over by the tutor profile, but re-reads the slots from the server and
 * only keeps the pre-selected time if the server still offers it.
 * <para>
 * Emits {@link LessonSelection} once a time is chosen (and `null` again whenever the choice is incomplete). Prices come from
 * the slots response (`TutorPriceCalculator` on the server) and are never multiplied or rounded here.
 * </para>
 */
@Component({
  selector: 'app-lesson-picker',
  imports: [ReactiveFormsModule, TranslatePipe, CurrencyThbPipe, Checkbox, SelectField, Skeleton, SlotPicker],
  templateUrl: './lesson-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  host: { class: 'flex flex-col gap-5' },
})
export class LessonPicker implements OnInit {
  readonly tutor = input.required<TutorPublicProfile>();
  readonly preselection = input<BookingPreselection>({ trial: false });
  readonly selectionChange = output<LessonSelection | null>();

  private readonly api = inject(TutoringPublicApiService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translation = inject(TranslationService);

  protected readonly offeringControl = new FormControl('', { nonNullable: true });
  protected readonly durationControl = new FormControl(String(PREFERRED_DURATION_MINUTES), { nonNullable: true });
  protected readonly trialControl = new FormControl(false, { nonNullable: true });

  protected readonly offeringId = signal('');
  protected readonly format = signal<SessionFormat>('OneOnOne');
  protected readonly trial = signal(false);
  protected readonly durationMinutes = signal(PREFERRED_DURATION_MINUTES);
  protected readonly weekIndex = signal(0);
  protected readonly selectedSlot = signal<TutorSlot | null>(null);
  /** Bangkok calendar date of "today", set in the browser after first render (empty on the server). */
  protected readonly today = signal('');
  /** The pre-selected start still waiting to be matched against the first slots response. */
  private readonly pendingStartsAt = signal<string | undefined>(undefined);
  protected readonly preselectionGone = signal(false);

  protected readonly formats: readonly SessionFormat[] = ['OneOnOne', 'Group'];
  protected readonly offering = computed<PublicOffering | undefined>(() => this.tutor().offerings.find((o) => o.offeringId === this.offeringId()));
  protected readonly canGroup = computed(() => this.offering()?.groupHourlyRatePerSeat != null);
  protected readonly trialOffer = computed(() => (this.format() === 'OneOnOne' ? (this.offering()?.trial ?? null) : null));
  protected readonly effectiveDuration = computed(() => (this.trial() ? (this.trialOffer()?.minutes ?? this.durationMinutes()) : this.durationMinutes()));

  protected readonly offeringOptions = computed<SelectOption[]>(() =>
    this.tutor().offerings.map((offering) => ({
      value: offering.offeringId,
      label: [
        localizedName(offering.subject, this.translation.locale()),
        this.translation.t(levelLabelKey(offering.level)),
        this.translation.t(curriculumLabelKey(offering.curriculum)),
      ].join(' - '),
    })),
  );
  /** The lesson lengths the tutor's profile says this deployment accepts (the server's own list; the client adds none). */
  protected readonly allowedDurations = computed(() => allowedDurationsOf(this.tutor()));
  protected readonly durationOptions = computed<SelectOption[]>(() =>
    this.allowedDurations().map((minutes) => ({ value: String(minutes), label: this.translation.t('tutoring.booking.durationOption', { minutes }) })),
  );

  protected readonly windowStart = computed(() => (this.today() === '' ? '' : (addDaysToDate(this.today(), this.weekIndex() * WINDOW_DAYS) ?? '')));
  protected readonly canGoPrevious = computed(() => this.weekIndex() > 0);
  protected readonly canGoNext = computed(() => this.today() !== '' && (this.weekIndex() + 1) * WINDOW_DAYS <= this.tutor().maxAdvanceDays);

  protected readonly slotsResource = rxResource({
    params: () => {
      const range = this.windowStart() === '' ? null : slotWindowRange(this.windowStart(), WINDOW_DAYS);
      const offering = this.offering();
      if (range === null || offering === undefined) {
        return undefined;
      }
      return {
        slug: this.tutor().slug,
        query: {
          offeringId: offering.offeringId,
          from: range.fromUtc,
          to: range.toUtc,
          durationMinutes: this.effectiveDuration(),
          format: this.format(),
          ...(this.trial() ? { trial: true } : {}),
        },
      };
    },
    stream: ({ params }) => this.api.getTutorSlots(params.slug, params.query),
  });
  private readonly slotsResponse = computed(() => (this.slotsResource.hasValue() ? this.slotsResource.value() : null));
  protected readonly slots = computed(() => this.slotsResponse()?.slots ?? []);
  protected readonly quote = computed(() => this.slotsResponse()?.quote ?? null);
  protected readonly pickerLoading = computed(() => this.slotsResource.status() === 'idle' || this.slotsResource.status() === 'loading');
  protected readonly pickerFailed = computed(() => this.slotsResource.status() === 'error');
  protected readonly pickerErrorKey = computed(() => tutoringErrorKey(this.slotsResource.error() as ApiError | undefined));

  private readonly lesson = computed<LessonSelection | null>(() => {
    const slot = this.selectedSlot();
    const quote = this.quote();
    const offering = this.offering();
    return slot === null || quote === null || offering === undefined
      ? null
      : { offeringId: offering.offeringId, format: this.format(), isTrial: this.trial(), durationMinutes: this.effectiveDuration(), slot, quote };
  });

  ngOnInit(): void {
    // Inputs are set before ngOnInit. A different tutor always arrives as a fresh instance (the page tears this step down
    // while the next tutor loads), so this initial choice is all that is ever needed.
    const pre = this.preselection();
    const offering = this.tutor().offerings.find((o) => o.offeringId === pre.offeringId) ?? this.tutor().offerings.at(0);
    const format: SessionFormat = pre.format === 'Group' && offering?.groupHourlyRatePerSeat != null ? 'Group' : 'OneOnOne';
    const trial = pre.trial && format === 'OneOnOne' && offering?.trial != null;
    const duration = initialDurationOf(this.allowedDurations(), pre.durationMinutes);

    this.offeringControl.setValue(offering?.offeringId ?? '', { emitEvent: false });
    this.offeringId.set(offering?.offeringId ?? '');
    this.format.set(format);
    this.durationControl.setValue(String(duration), { emitEvent: false });
    this.durationMinutes.set(duration);
    this.trialControl.setValue(trial, { emitEvent: false });
    this.trial.set(trial);
    this.pendingStartsAt.set(pre.startsAtUtc);
  }

  constructor() {
    this.offeringControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.offeringId.set(id);
      this.format.set('OneOnOne');
      this.setTrial(false);
      this.clearSlot();
    });
    this.durationControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.durationMinutes.set(Number(value));
      this.clearSlot();
    });
    this.trialControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.trial.set(value);
      this.clearSlot();
    });

    // Keep the pre-selected time only if the server's first answer still offers it.
    effect(() => {
      const response = this.slotsResponse();
      const wanted = this.pendingStartsAt();
      if (response === null || wanted === undefined) {
        return;
      }
      untracked(() => {
        this.pendingStartsAt.set(undefined);
        const match = findSlotStartingAt(response.slots, wanted);
        if (match) {
          this.selectedSlot.set(match);
        } else {
          this.preselectionGone.set(true);
        }
      });
    });

    effect(() => {
      const lesson = this.lesson();
      untracked(() => this.selectionChange.emit(lesson));
    });

    afterNextRender(() => {
      const today = bangkokDateOf(Date.now());
      this.weekIndex.set(initialWeekIndex(today, this.pendingStartsAt(), Math.floor(this.tutor().maxAdvanceDays / WINDOW_DAYS)));
      this.today.set(today);
      const stop = startVisibleInterval(this.document, SLOT_REFRESH_MS, () => {
        if (this.slotsResource.status() === 'resolved') {
          this.slotsResource.reload();
        }
      });
      this.destroyRef.onDestroy(stop);
    });
  }

  /** Re-reads the calendar and forgets the chosen time - used after the server said the time is gone. */
  reload(): void {
    this.clearSlot();
    this.slotsResource.reload();
  }

  /** The server says this learner already used the trial with this tutor: go back to a paid lesson of the chosen length. */
  dropTrial(): void {
    this.setTrial(false);
    this.clearSlot();
  }

  protected chooseFormat(format: SessionFormat): void {
    if (format === this.format() || (format === 'Group' && !this.canGroup())) {
      return;
    }
    this.format.set(format);
    this.setTrial(false);
    this.clearSlot();
  }

  protected previousWeek(): void {
    this.weekIndex.update((week) => Math.max(0, week - 1));
  }

  protected nextWeek(): void {
    if (this.canGoNext()) {
      this.weekIndex.update((week) => week + 1);
    }
  }

  protected retry(): void {
    this.slotsResource.reload();
  }

  protected onSlotChosen(slot: TutorSlot | null): void {
    this.selectedSlot.set(slot);
    if (slot !== null) {
      this.preselectionGone.set(false);
    }
  }

  protected isFormatActive(format: SessionFormat): boolean {
    return this.format() === format;
  }

  protected formatKey(format: SessionFormat): string {
    return formatLabelKey(format);
  }

  private clearSlot(): void {
    this.selectedSlot.set(null);
    this.preselectionGone.set(false);
  }

  private setTrial(value: boolean): void {
    this.trialControl.setValue(value, { emitEvent: false });
    this.trial.set(value);
  }
}
