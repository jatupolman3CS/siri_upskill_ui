import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorInfo } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { SeoService } from '../../../../core/seo/seo.service';
import { Breadcrumb, type BreadcrumbItem } from '../../../../shared/breadcrumb/breadcrumb';
import { Button } from '../../../../shared/button/button';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { parseBookingPreselection } from '../../data/tutoring-booking.util';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from '../../data/tutoring-errors';
import { curriculumLabelKey, formatLabelKey, levelLabelKey, localizedName } from '../../data/tutoring-labels';
import { TutoringLearnerApiService } from '../../data/tutoring-learner-api.service';
import type { LearnerProfile } from '../../data/tutoring-learner.models';
import { TutoringPublicApiService } from '../../data/tutoring-public-api.service';
import type { TutorPublicProfile } from '../../data/tutoring-public.models';
import { TutorProblem } from '../../ui/tutor-problem/tutor-problem';
import { LearnerProfilePicker } from '../learner-profile-picker/learner-profile-picker';
import { LessonPicker, type LessonSelection } from './lesson-picker/lesson-picker';

/** Reasons that mean "the time you picked is not (or no longer) available": reload the calendar and pick again. */
const SLOT_GONE_REASONS: ReadonlySet<string> = new Set([
  'tutoring.slot_taken',
  'tutoring.slot_unavailable',
  'tutoring.seats_full',
  'tutoring.slot_too_soon',
  'tutoring.slot_too_far',
  'tutoring.slot_not_on_grid',
]);

/**
 * `/tutors/:slug/book` (P13-22, signed-in only) - choose the lesson, say who it is for, and hold the slot.
 * <para>
 * The query string is only a pre-selection from the tutor profile: the tutor, offerings and calendar are re-read from the
 * server, the booking call carries just ids and the chosen time, and the price the person sees is the server's quote - the
 * booking that comes back holds the authoritative `priceAmount`. Success always continues at `/tutoring/checkout/:bookingId`
 * (a free trial arrives there already confirmed). Every refusal the server documents is explained with a way forward: a
 * lost slot reloads the calendar, a slot you already hold offers its checkout.
 * </para>
 */
@Component({
  selector: 'app-booking-page',
  imports: [
    RouterLink,
    NgIcon,
    TranslatePipe,
    BangkokDatePipe,
    CurrencyThbPipe,
    Breadcrumb,
    Button,
    Skeleton,
    TutorProblem,
    LearnerProfilePicker,
    LessonPicker,
  ],
  templateUrl: './booking-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorInfo })],
})
export class BookingPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publicApi = inject(TutoringPublicApiService);
  private readonly learnerApi = inject(TutoringLearnerApiService);
  private readonly seo = inject(SeoService);
  protected readonly translation = inject(TranslationService);

  private readonly paramMap = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly slug = computed(() => this.paramMap().get('slug') ?? '');
  protected readonly preselection = parseBookingPreselection(this.route.snapshot.queryParamMap);

  private readonly tutorResource = rxResource({ params: () => this.slug(), stream: ({ params }) => this.publicApi.getTutorProfile(params) });
  protected readonly tutor = computed<TutorPublicProfile | undefined>(() => (this.tutorResource.hasValue() ? this.tutorResource.value() : undefined));
  private readonly tutorError = computed(() => this.tutorResource.error() as ApiError | undefined);
  protected readonly tutorNotFound = computed(() => this.tutorError()?.status === 404);
  protected readonly tutorFailed = computed(() => this.tutorError() !== undefined && this.tutorError()?.status !== 404);

  private readonly policyResource = rxResource({ stream: () => this.learnerApi.getCancellationPolicy() });
  protected readonly policy = computed(() => (this.policyResource.hasValue() ? this.policyResource.value() : null));

  protected readonly learner = signal<LearnerProfile | null>(null);

  protected readonly lesson = signal<LessonSelection | null>(null);
  protected readonly submitting = signal(false);
  protected readonly problem = signal<string | null>(null);
  /** Set with `slot_already_held_by_you`: the booking that already holds this time. */
  protected readonly heldBookingId = signal<string | null>(null);
  private readonly lessonPicker = viewChild(LessonPicker);
  private readonly learnerPicker = viewChild(LearnerProfilePicker);

  protected readonly canReserve = computed(() => this.lesson() !== null && this.learner() !== null);
  protected readonly levelKey = levelLabelKey;
  protected readonly curriculumKey = curriculumLabelKey;
  protected readonly formatKey = formatLabelKey;
  protected readonly localizedName = localizedName;

  protected readonly selectedOffering = computed(() => this.tutor()?.offerings.find((offering) => offering.offeringId === this.lesson()?.offeringId));
  protected readonly breadcrumbItems = computed<readonly BreadcrumbItem[]>(() => {
    const tutor = this.tutor();
    return tutor === undefined
      ? []
      : [
          { label: this.translation.t('nav.home'), href: '/' },
          { label: this.translation.t('tutoring.public.search.heading'), href: '/tutors' },
          { label: tutor.displayName, href: `/tutors/${tutor.slug}` },
          { label: this.translation.t('tutoring.booking.breadcrumb') },
        ];
  });

  constructor() {
    effect(() => {
      const appName = this.translation.t('common.appName');
      const tutor = this.tutor();
      this.seo.set({
        title: `${this.translation.t('tutoring.booking.pageTitle', { name: tutor?.displayName ?? '' }).trim()} | ${appName}`,
        description: this.translation.t('tutoring.booking.pageDescription'),
        path: `/tutors/${this.slug()}/book`,
        robots: 'noindex',
      });
    });
  }

  protected retryTutor(): void {
    this.tutorResource.reload();
  }

  protected reserve(): void {
    const lesson = this.lesson();
    const learner = this.learner();
    if (this.submitting() || lesson === null || learner === null) {
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);
    this.heldBookingId.set(null);
    this.learnerApi
      .createBooking({
        offeringId: lesson.offeringId,
        startsAtUtc: lesson.slot.startsAtUtc,
        durationMinutes: lesson.durationMinutes,
        format: lesson.format,
        learnerProfileId: learner.learnerProfileId,
        isTrial: lesson.isTrial,
      })
      .subscribe({
        next: (booking) => {
          this.submitting.set(false);
          void this.router.navigate(['/tutoring/checkout', booking.bookingId]);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.onBookingRefused(error);
        },
      });
  }

  /** Turns a documented refusal into the recovery it needs, then explains it. */
  private onBookingRefused(error: unknown): void {
    const reason = tutoringReasonOf(error);
    if (reason !== undefined && SLOT_GONE_REASONS.has(reason)) {
      this.lessonPicker()?.reload();
    } else if (reason === 'tutoring.trial_already_used') {
      this.lessonPicker()?.dropTrial();
    } else if (reason === 'tutoring.learner_profile_not_found' || reason === 'tutoring.learner_profile_inactive') {
      this.learnerPicker()?.forgetAndReload();
    } else if (reason === 'tutoring.offering_not_found') {
      this.tutorResource.reload();
    } else if (reason === 'tutoring.slot_already_held_by_you') {
      this.heldBookingId.set(tutoringProblemOf(error)?.bookingId ?? null);
    }
    this.problem.set(this.translation.t(tutoringErrorKey(error)));
  }
}
