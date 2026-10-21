import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { addDaysToDate } from '../../../../live/data/live-instructor.util';
import { bangkokDateOf, slotWindowRange } from '../../../data/tutor-slots.util';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../../data/tutoring-errors';
import type { Booking } from '../../../data/tutoring-learner.models';
import { TutoringPackagePurchaseApiService } from '../../../data/tutoring-package-purchase-api.service';
import type { PackagePurchaseDetail } from '../../../data/tutoring-package-purchase.models';
import { TutoringPublicApiService } from '../../../data/tutoring-public-api.service';
import type { Guid, TutorSlot } from '../../../data/tutoring-public.models';
import { startVisibleInterval } from '../../../data/visible-interval';
import { SlotPicker } from '../../../ui/slot-picker/slot-picker';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

const WINDOW_DAYS = 7;
/** Refresh the calendar every minute so a time someone else just took does not linger. */
const SLOT_REFRESH_MS = 60_000;

/** The refusals that mean "the time you picked is not (or no longer) available": read the calendar again and pick another. */
const SLOT_GONE_REASONS: ReadonlySet<string> = new Set([
  'tutoring.slot_taken',
  'tutoring.slot_unavailable',
  'tutoring.slot_too_soon',
  'tutoring.slot_too_far',
  'tutoring.slot_not_on_grid',
]);
/** The refusals that mean the purchase itself changed under the person: the page should read it again. */
const PURCHASE_CHANGED_REASONS: ReadonlySet<string> = new Set([
  'tutoring.package_no_credit',
  'tutoring.package_expired',
  'tutoring.package_not_active',
  'tutoring.package_purchase_not_found',
]);

/**
 * "Book a lesson with a credit" (P13-22b): the tutor's real calendar for the package's own subject and lesson length, and one button
 * that spends one credit on the chosen time. Booking is immediate - the lesson comes back `Confirmed`, there is no payment step.
 * <para>
 * Nothing here decides entitlement. The offering, the length, the learner and the credit all come from the purchase on the server;
 * this component only sends the chosen start. Whether a credit is left, whether the package has expired, whether the start is before the
 * expiry date, whether the tutor can still teach - every one of those is checked by the server, and its refusal is shown in words
 * (`package_session_after_expiry` names the expiry date; a lost time reloads the calendar). The calendar is read in the browser after
 * the first render, like every volatile slot list.
 * </para>
 */
@Component({
  selector: 'app-package-credit-booking',
  imports: [RouterLink, TranslatePipe, BangkokDatePipe, Button, SlotPicker, TutorProblem],
  templateUrl: './package-credit-booking.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
})
export class PackageCreditBooking {
  readonly purchase = input.required<PackagePurchaseDetail>();
  /** The offering the package was sold for (from the tutor's public package list - the purchase itself carries no offering). */
  readonly offeringId = input.required<Guid>();
  /** A lesson was booked with a credit: the page should read the purchase again. */
  readonly booked = output<Booking>();
  /** The refusal says the purchase changed (credit gone, expired, not active): the page should read it again. */
  readonly purchaseChanged = output<void>();

  private readonly publicApi = inject(TutoringPublicApiService);
  private readonly purchaseApi = inject(TutoringPackagePurchaseApiService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslationService);

  protected readonly weekIndex = signal(0);
  protected readonly selectedSlot = signal<TutorSlot | null>(null);
  /** Bangkok calendar date of "today", set in the browser after first render (empty on the server). */
  protected readonly today = signal('');
  protected readonly submitting = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly lastBooked = signal<Booking | null>(null);
  /** Set with `package_session_after_expiry`: when the credits stop being usable, so the person knows which times to look at. */
  protected readonly expiryHint = signal<string | null>(null);

  protected readonly windowStart = computed(() => (this.today() === '' ? '' : (addDaysToDate(this.today(), this.weekIndex() * WINDOW_DAYS) ?? '')));
  protected readonly canGoPrevious = computed(() => this.weekIndex() > 0);
  protected readonly canGoNext = computed(() => {
    const limit = this.slotsResource.hasValue() ? this.slotsResource.value().maxAdvanceDays : null;
    return this.today() !== '' && (limit === null || (this.weekIndex() + 1) * WINDOW_DAYS <= limit);
  });

  // Separate computeds, so a new copy of the same purchase (read again after a booking) does not read the calendar again.
  private readonly tutorSlug = computed(() => this.purchase().tutor.slug);
  private readonly lessonMinutes = computed(() => this.purchase().durationMinutes);

  protected readonly slotsResource = rxResource({
    params: () => {
      const range = this.windowStart() === '' ? null : slotWindowRange(this.windowStart(), WINDOW_DAYS);
      if (range === null) {
        return undefined;
      }
      return {
        slug: this.tutorSlug(),
        query: { offeringId: this.offeringId(), from: range.fromUtc, to: range.toUtc, durationMinutes: this.lessonMinutes(), format: 'OneOnOne' as const },
      };
    },
    stream: ({ params }) => this.publicApi.getTutorSlots(params.slug, params.query),
  });
  protected readonly slots = computed(() => (this.slotsResource.hasValue() ? this.slotsResource.value().slots : []));
  protected readonly pickerLoading = computed(() => this.slotsResource.status() === 'idle' || this.slotsResource.status() === 'loading');
  protected readonly pickerFailed = computed(() => this.slotsResource.status() === 'error');
  protected readonly pickerError = computed(() => (this.pickerFailed() ? this.i18n.t(tutoringErrorKey(this.slotsResource.error() as ApiError | undefined)) : null));

  constructor() {
    afterNextRender(() => {
      this.today.set(bangkokDateOf(Date.now()));
      this.destroyRef.onDestroy(
        startVisibleInterval(this.document, SLOT_REFRESH_MS, () => {
          if (this.slotsResource.status() === 'resolved') {
            this.slotsResource.reload();
          }
        }),
      );
    });
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

  /** Spends one credit on the chosen time. The button is busy while the call is out, so a double click books once. */
  protected book(): void {
    const slot = this.selectedSlot();
    if (this.submitting() || slot === null) {
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);
    this.lastBooked.set(null);
    this.expiryHint.set(null);
    this.purchaseApi.bookWithCredit(this.purchase().purchaseId, slot.startsAtUtc).subscribe({
      next: (booking) => {
        this.submitting.set(false);
        this.lastBooked.set(booking);
        this.selectedSlot.set(null);
        this.slotsResource.reload();
        this.booked.emit(booking);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.onRefused(error);
      },
    });
  }

  /** Turns a documented refusal into the recovery it needs, then explains it. */
  private onRefused(error: unknown): void {
    const reason = tutoringReasonOf(error);
    if (reason !== undefined && SLOT_GONE_REASONS.has(reason)) {
      this.selectedSlot.set(null);
      this.slotsResource.reload();
    } else if (reason !== undefined && PURCHASE_CHANGED_REASONS.has(reason)) {
      this.purchaseChanged.emit();
    } else if (reason === 'tutoring.package_session_after_expiry') {
      this.selectedSlot.set(null);
    }
    this.problem.set(this.i18n.t(tutoringErrorKey(error)));
    // The expiry date the server names (or the purchase's own) is shown next to the message by the template.
    this.expiryHint.set(reason === 'tutoring.package_session_after_expiry' ? (tutoringProblemOf(error)?.expiresAtUtc ?? this.purchase().expiresAtUtc) : null);
  }
}
