import { CurrencyPipe, DOCUMENT, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, RESPONSE_INIT, computed, effect, inject, linkedSignal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  phosphorCalendarBlank,
  phosphorCertificate,
  phosphorClock,
  phosphorGraduationCap,
  phosphorShieldCheck,
  phosphorStar,
  phosphorUsers,
} from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../core/http/error.interceptor';
import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { MediaUrlPipe } from '../../../../core/pipes/media-url.pipe';
import { buildBreadcrumbListJsonLd, buildTutorPersonJsonLd } from '../../../../core/seo/schema-org.util';
import { SeoService } from '../../../../core/seo/seo.service';
import { Breadcrumb, BreadcrumbItem } from '../../../../shared/breadcrumb/breadcrumb';
import { Button } from '../../../../shared/button/button';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { curriculumLabelKey, levelLabelKey, localizedName, roundRating, truncateText } from '../../data/tutoring-labels';
import { TutoringPublicApiService } from '../../data/tutoring-public-api.service';
import type { TutorPublicProfile } from '../../data/tutoring-public.models';
import { TutorBookingPanel } from './tutor-booking-panel/tutor-booking-panel';
import { TutorIntroVideo } from './tutor-intro-video/tutor-intro-video';
import { TutorPackagesSection } from './tutor-packages-section/tutor-packages-section';
import { TutorReviewsSection } from './tutor-reviews-section/tutor-reviews-section';

const META_DESCRIPTION_MAX = 160;
/** Contract P13-04 section 9: the Person description is the bio cut at 300 characters. */
const JSON_LD_DESCRIPTION_MAX = 300;
const BOOKING_ANCHOR_ID = 'tutor-booking';

/**
 * `/tutors/:slug` (P13-21) - the public tutor profile, server-rendered and indexable.
 * <para>
 * Only data the API deliberately made public is shown (no contact, identity or KYC detail exists in the DTO). A slug that is
 * not publicly visible for ANY reason (unknown, draft, suspended, unlisted, no active offering) answers one identical 404,
 * which this page renders as a plain "not found" and marks `noindex` - it never hints at which case it was.
 * </para>
 * <para>
 * SEO (`SeoService`): title `{name} - tutor of {subject}`, canonical without any query string, and JSON-LD `Person` +
 * `BreadcrumbList`. The Person's `aggregateRating` is emitted only when `ratingCount > 0`, and no `Review` objects are
 * emitted at all until real reviews exist (P13-13). Every branch of the effect re-asserts a path-correct SEO state, including
 * errors, so the route being reused between two slugs can never leave the previous tutor's canonical or structured data behind
 * (same lesson as `CourseDetailPage`).
 * </para>
 * The intro video block (`@defer (on viewport)` with a size-reserving placeholder) disappears quietly when the video endpoint
 * says there is nothing public to play; the booking card owns the calendar and is a separate component.
 */
@Component({
  selector: 'app-tutor-profile-page',
  imports: [
    RouterLink,
    NgOptimizedImage,
    NgIcon,
    TranslatePipe,
    BangkokDatePipe,
    CurrencyThbPipe,
    MediaUrlPipe,
    Breadcrumb,
    Button,
    Skeleton,
    TutorBookingPanel,
    TutorIntroVideo,
    TutorPackagesSection,
    TutorReviewsSection,
  ],
  templateUrl: './tutor-profile-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    CurrencyPipe,
    provideIcons({
      phosphorCalendarBlank,
      phosphorCertificate,
      phosphorClock,
      phosphorGraduationCap,
      phosphorShieldCheck,
      phosphorStar,
      phosphorUsers,
    }),
  ],
})
export class TutorProfilePage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(TutoringPublicApiService);
  private readonly seo = inject(SeoService);
  private readonly document = inject(DOCUMENT);
  /** Only provided while server-rendering; `null` in the browser. */
  private readonly responseInit = inject(RESPONSE_INIT, { optional: true });
  private readonly mediaUrl = new MediaUrlPipe();
  protected readonly translation = inject(TranslationService);

  private readonly paramMap = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  protected readonly slug = computed(() => this.paramMap().get('slug') ?? '');

  protected readonly profileResource = rxResource({
    params: () => this.slug(),
    stream: ({ params }) => this.api.getTutorProfile(params),
  });
  /** Guarded read: `.value()` throws while the resource is in its error state. */
  protected readonly profile = computed<TutorPublicProfile | undefined>(() =>
    this.profileResource.hasValue() ? this.profileResource.value() : undefined,
  );
  private readonly resourceError = computed(() => this.profileResource.error() as ApiError | undefined);
  protected readonly isNotFound = computed(() => this.resourceError()?.status === 404);
  protected readonly hasOtherError = computed(() => {
    const error = this.resourceError();
    return error !== undefined && error.status !== 404;
  });

  /** Set by the intro video when the server reports nothing public to play; re-armed for every new slug. */
  protected readonly introVideoHidden = linkedSignal<string, boolean>({ source: this.slug, computation: () => false });

  protected readonly levelKey = levelLabelKey;
  protected readonly curriculumKey = curriculumLabelKey;
  protected readonly localizedName = localizedName;

  protected readonly rating = computed(() => roundRating(this.profile()?.ratingAverage ?? 0));
  protected readonly subjectNames = computed(() => {
    const locale = this.translation.locale();
    return [...new Set((this.profile()?.offerings ?? []).map((offering) => localizedName(offering.subject, locale)))];
  });

  protected readonly breadcrumbItems = computed<readonly BreadcrumbItem[]>(() => {
    const profile = this.profile();
    if (profile === undefined) {
      return [];
    }
    return [
      { label: this.translation.t('nav.home'), href: '/' },
      { label: this.translation.t('tutoring.public.search.heading'), href: '/tutors' },
      { label: profile.displayName },
    ];
  });

  constructor() {
    effect(() => {
      const appName = this.translation.t('common.appName');
      const path = `/tutors/${this.slug()}`;

      if (this.isNotFound()) {
        // A real 404 status for crawlers, not just a "not found" page served as 200 (a soft 404 the search engine keeps
        // indexing). The SSR response is built from this very object, so mutating it is how Angular intends it to be set.
        if (this.responseInit) {
          this.responseInit.status = 404;
        }
        this.seo.set({
          title: `${this.translation.t('tutoring.public.profile.notFoundHeading')} | ${appName}`,
          description: this.translation.t('tutoring.public.profile.notFoundDescription'),
          path,
          robots: 'noindex',
        });
        return;
      }
      if (this.hasOtherError()) {
        this.seo.set({
          title: `${this.translation.t('tutoring.public.profile.errorHeading')} | ${appName}`,
          description: this.translation.t('tutoring.public.profile.fallbackDescription'),
          path,
          robots: 'noindex',
        });
        return;
      }

      const profile = this.profile();
      if (profile === undefined) {
        return;
      }

      const subjects = this.subjectNames();
      const title = subjects.length > 0
        ? this.translation.t('tutoring.public.profile.seoTitle', { name: profile.displayName, subject: subjects[0] })
        : profile.displayName;
      const description = truncateText(profile.bio || profile.headline || '', META_DESCRIPTION_MAX)
        || this.translation.t('tutoring.public.profile.fallbackDescription');
      const image = this.absolutePhotoUrl(profile.photoUrl);

      this.seo.set({
        title: `${title} | ${appName}`,
        description,
        path,
        openGraph: { image, type: 'website' },
        jsonLd: [
          buildTutorPersonJsonLd({
            name: profile.displayName,
            description: truncateText(profile.bio, JSON_LD_DESCRIPTION_MAX) || description,
            url: this.seo.absoluteUrl(path),
            image,
            jobTitle: profile.headline,
            knowsAbout: subjects,
            ratingAverage: profile.ratingAverage,
            ratingCount: profile.ratingCount,
          }),
          buildBreadcrumbListJsonLd([
            { name: this.translation.t('nav.home'), url: this.seo.absoluteUrl('/') },
            { name: this.translation.t('tutoring.public.search.heading'), url: this.seo.absoluteUrl('/tutors') },
            { name: profile.displayName, url: this.seo.absoluteUrl(path) },
          ]),
        ],
      });
    });
  }

  protected initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  protected retry(): void {
    this.profileResource.reload();
  }

  protected hideIntroVideo(): void {
    this.introVideoHidden.set(true);
  }

  /** The booking card sits after the details; on small screens this jumps to it and moves focus there. */
  protected scrollToBooking(): void {
    const target = this.document.getElementById(BOOKING_ANCHOR_ID);
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }

  private absolutePhotoUrl(photoUrl: string | null): string | null {
    if (photoUrl === null) {
      return null;
    }
    const resolved = this.mediaUrl.transform(photoUrl);
    return resolved.startsWith('/') ? this.seo.absoluteUrl(resolved) : resolved;
  }
}
