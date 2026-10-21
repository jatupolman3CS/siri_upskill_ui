import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { CurrencyThbPipe } from '../../../../../core/i18n/currency-thb.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { localizedName } from '../../../data/tutoring-labels';
import type { TutorCertificate, TutorEducation, TutorOffering } from '../../../data/tutoring-tutor.models';

/**
 * What a tutor teaches, studied and holds, read-only (P13-26): the offerings with their rates, the education history and the
 * certificates. All of it is what the tutor entered; an administrator corrects nothing here. Prices are the server's figures.
 */
@Component({
  selector: 'app-tutor-record-lists',
  imports: [TranslatePipe, CurrencyThbPipe],
  templateUrl: './tutor-record-lists.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class TutorRecordLists {
  private readonly i18n = inject(TranslationService);

  readonly offerings = input.required<readonly TutorOffering[]>();
  readonly educations = input.required<readonly TutorEducation[]>();
  readonly certificates = input.required<readonly TutorCertificate[]>();

  protected subjectName(offering: TutorOffering): string {
    return localizedName(offering.subject, this.i18n.locale());
  }
}
