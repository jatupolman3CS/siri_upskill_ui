import { CurrencyPipe, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorInfo } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Checkbox } from '../../../../../shared/checkbox/checkbox';
import { SelectField, SelectOption } from '../../../../../shared/select/select';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { addDaysToDate } from '../../../../live/data/live-instructor.util';
import { TUTOR_BOOKING_ROUTE, buildBookingQueryParams, isRouteDeclared } from '../../../data/tutor-booking-link';
import { bangkokDateOf, slotWindowRange } from '../../../data/tutor-slots.util';
import { allowedDurationsOf, initialDurationOf } from '../../../data/tutoring-booking.util';
import { curriculumLabelKey, formatLabelKey, levelLabelKey, localizedName } from '../../../data/tutoring-labels';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { TutoringPublicApiService } from '../../../data/tutoring-public-api.service';
import type { PublicOffering, SessionFormat, TutorPublicProfile, TutorSlot } from '../../../data/tutoring-public.models';
import { startVisibleInterval } from '../../../data/visible-interval';
import { SlotPicker } from '../../../ui/slot-picker/slot-picker';

const WINDOW_DAYS = 7;
/** Contract FE note: refresh the calendar every 30-60 s so a slot someone else just took does not linger. */
const SLOT_REFRESH_MS = 60_000;

/**
 * The booking card of the tutor profile (P13-21): choose an offering, lesson format and length, pick a time, see the
 * server's quote, and continue to the booking page.
 * <para>
 * Nothing here decides money or availability. The price shown is `quote.amount` from the slots response (computed by the
 * server's `TutorPriceCalculator`; never multiplied here), the slots are the server's, and the booking page re-validates
 * everything - the query params handed to it are only a pre-selection.
 * </para>
 * <para>
 * Slots are fetched in the browser only (after first render): they are volatile, belong to nobody's SEO, and a
 * server-rendered snapshot would be stale the moment it hydrated. The calendar window is seven Bangkok days starting
 * today, paged by weeks up to the tutor's own `maxAdvanceDays`.
 * </para>
 * <para>
 * The "Book" action only navigates when the router really declares {@link TUTOR_BOOKING_ROUTE} (P13-22); until then the
 * button stays disabled with an explanation, so it can never send a visitor to the catch-all redirect.
 * </para>
 */
@Component({
  selector: 'app-tutor-booking-panel',
  imports: [ReactiveFormsModule, RouterLink, NgIcon, TranslatePipe, BangkokDatePipe, CurrencyThbPipe, Button, Checkbox, SelectField, Skeleton, SlotPicker],
  templateUrl: './tutor-booking-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorInfo })],
  host: { class: 'block' },
})
export class TutorBookingPanel implements OnInit {
  readonly tutor = input.required<TutorPublicProfile>();

  private readonly api = inject(TutoringPublicApiService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translation = inject(TranslationService);

  protected readonly offeringControl = new FormControl('', { nonNullable: true });
  protected readonly durationControl = new FormControl('60', { nonNullable: true });
  protected readonly trialControl = new FormControl(false, { nonNullable: true });

  protected readonly offeringId = signal('');
  protected readonly format = signal<SessionFormat>('OneOnOne');
  protected readonly trial = signal(false);
  protected readonly durationMinutes = signal(60);
  protected readonly weekIndex = signal(0);
  protected readonly selectedSlot = signal<TutorSlot | null>(null);
  /** Bangkok calendar date of "today", set in the browser after first render (empty on the server). */
  protected readonly today = signal('');

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
    this.allowedDurations().map((minutes) => ({
      value: String(minutes),
      label: this.translation.t('tutoring.public.profile.booking.durationOption', { minutes }),
    })),
  );
  protected readonly formats: readonly SessionFormat[] = ['OneOnOne', 'Group'];

  protected readonly windowStart = computed(() => (this.today() === '' ? '' : (addDaysToDate(this.today(), this.weekIndex() * WINDOW_DAYS) ?? '')));
  protected readonly canGoPrevious = computed(() => this.weekIndex() > 0);
  /** The next window must still start within the tutor's own advance-booking horizon. */
  protected readonly canGoNext = computed(
    () => this.today() !== '' && (this.weekIndex() + 1) * WINDOW_DAYS <= this.tutor().maxAdvanceDays,
  );

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

  protected readonly bookingRouteReady = isRouteDeclared(this.router.config, TUTOR_BOOKING_ROUTE);
  protected readonly bookingQueryParams = computed(() => {
    const slot = this.selectedSlot();
    const offering = this.offering();
    return slot === null || offering === undefined
      ? null
      : buildBookingQueryParams({
          offeringId: offering.offeringId,
          startsAtUtc: slot.startsAtUtc,
          durationMinutes: this.effectiveDuration(),
          format: this.format(),
          trial: this.trial(),
        });
  });

  ngOnInit(): void {
    // Inputs are set before ngOnInit. The page destroys this panel while another tutor loads (its resource has no value
    // then), so a different tutor always arrives as a fresh instance and this initial choice is all that is ever needed.
    const duration = initialDurationOf(this.allowedDurations());
    this.durationControl.setValue(String(duration), { emitEvent: false });
    this.durationMinutes.set(duration);
    this.offeringControl.setValue(this.tutor().offerings.at(0)?.offeringId ?? '');
  }

  constructor() {
    this.offeringControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.offeringId.set(id);
      this.format.set('OneOnOne');
      this.setTrial(false);
      this.selectedSlot.set(null);
    });
    this.durationControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.durationMinutes.set(Number(value));
      this.selectedSlot.set(null);
    });
    this.trialControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.trial.set(value);
      this.selectedSlot.set(null);
    });

    afterNextRender(() => {
      this.today.set(bangkokDateOf(Date.now()));
      const stop = startVisibleInterval(this.document, SLOT_REFRESH_MS, () => {
        if (this.slotsResource.status() === 'resolved') {
          this.slotsResource.reload();
        }
      });
      this.destroyRef.onDestroy(stop);
    });
  }

  protected chooseFormat(format: SessionFormat): void {
    if (format === this.format() || (format === 'Group' && !this.canGroup())) {
      return;
    }
    this.format.set(format);
    this.setTrial(false);
    this.selectedSlot.set(null);
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

  protected isFormatActive(format: SessionFormat): boolean {
    return this.format() === format;
  }

  protected formatKey(format: SessionFormat): string {
    return formatLabelKey(format);
  }

  private setTrial(value: boolean): void {
    this.trialControl.setValue(value, { emitEvent: false });
    this.trial.set(value);
  }
}
