import { CurrencyPipe, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorClock, phosphorGift, phosphorStar, phosphorUsers } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../core/i18n/bangkok-date.pipe';
import { CurrencyThbPipe } from '../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { MediaUrlPipe } from '../../../../core/pipes/media-url.pipe';
import { localizedName, roundRating } from '../../data/tutoring-labels';
import type { TutorSearchItem, TutorSearchSubject } from '../../data/tutoring-public.models';

/** Subjects shown as chips before the rest collapse into "+N" (the full list is on the profile page). */
const MAX_SUBJECT_CHIPS = 3;

/**
 * One tutor in the `/tutors` results grid. The whole card is a single link to the profile (stretched-link pattern: the
 * name `<a>`'s `::after` covers the card, so there is exactly one tab stop and no nested interactive content).
 * Every figure shown (rating, "from" price, next available time) is the server's - nothing is derived on the client.
 */
@Component({
  selector: 'app-tutor-card',
  imports: [RouterLink, NgOptimizedImage, NgIcon, TranslatePipe, CurrencyThbPipe, BangkokDatePipe, MediaUrlPipe],
  templateUrl: './tutor-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, provideIcons({ phosphorClock, phosphorGift, phosphorStar, phosphorUsers })],
  host: { class: 'block h-full' },
})
export class TutorCard {
  readonly tutor = input.required<TutorSearchItem>();

  private readonly translation = inject(TranslationService);

  protected readonly rating = computed(() => roundRating(this.tutor().ratingAverage));
  protected readonly visibleSubjects = computed(() => this.tutor().subjects.slice(0, MAX_SUBJECT_CHIPS));
  protected readonly hiddenSubjectCount = computed(() => Math.max(0, this.tutor().subjects.length - MAX_SUBJECT_CHIPS));
  protected readonly initial = computed(() => this.tutor().displayName.trim().charAt(0).toUpperCase() || '?');

  protected subjectName(subject: TutorSearchSubject): string {
    return localizedName(subject, this.translation.locale());
  }
}
