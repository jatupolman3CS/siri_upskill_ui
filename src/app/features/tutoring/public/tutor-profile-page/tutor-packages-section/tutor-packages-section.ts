import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { curriculumLabelKey, levelLabelKey, localizedName } from '../../../data/tutoring-labels';
import type { PackageOffer } from '../../../data/tutoring-packages.models';
import { TutoringPublicApiService } from '../../../data/tutoring-public-api.service';

/**
 * The "Lesson packages" block of the public tutor profile (P13-22b): the packages this tutor has on sale - N one-on-one lessons of M
 * minutes at a discount - with the server's prices, how long they stay valid, and the way to buy one.
 * <para>
 * Every figure is the server's (total, price per lesson, the saving); nothing is multiplied or rounded here. The packages are read in
 * the browser after the first render, never during the server render: they are not part of what a search engine needs and a failing
 * read must not hold up (or break) the profile page. The block shows only when there is at least one package; while it loads, or if the
 * read fails, it is simply absent. Buying needs a sign-in, which the buy page asks for.
 * </para>
 */
@Component({
  selector: 'app-tutor-packages-section',
  imports: [RouterLink, TranslatePipe, CurrencyThbPipe],
  templateUrl: './tutor-packages-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
  // No box of its own: with no packages the empty host must not add a gap to the profile's column.
  host: { class: 'contents' },
})
export class TutorPackagesSection {
  readonly slug = input.required<string>();

  private readonly api = inject(TutoringPublicApiService);
  protected readonly translation = inject(TranslationService);

  /** Flipped after the first browser render, so the read never runs while the page is rendered on the server. */
  private readonly inBrowser = signal(false);
  private readonly offersResource = rxResource({
    params: () => (this.inBrowser() ? this.slug() : undefined),
    stream: ({ params }) => this.api.listTutorPackages(params),
  });
  /** Guarded read: `.value()` throws while the resource is in its error state. */
  protected readonly offers = computed<readonly PackageOffer[]>(() => (this.offersResource.hasValue() ? this.offersResource.value() : []));

  protected readonly levelKey = levelLabelKey;
  protected readonly curriculumKey = curriculumLabelKey;
  protected readonly localizedName = localizedName;

  protected subjectName(offer: PackageOffer): string {
    return localizedName({ nameTh: offer.offering.subjectNameTh, nameEn: offer.offering.subjectNameEn }, this.translation.locale());
  }

  constructor() {
    afterNextRender(() => this.inBrowser.set(true));
  }
}
