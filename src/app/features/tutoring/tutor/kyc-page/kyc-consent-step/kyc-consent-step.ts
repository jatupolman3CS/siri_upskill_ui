import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorShieldCheck } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Checkbox } from '../../../../../shared/checkbox/checkbox';
import { tutoringErrorKey, tutoringReasonOf } from '../../../data/tutoring-errors';
import { TutoringKycApiService } from '../../../data/tutoring-kyc-api.service';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

/** The parts of one consent version, in reading order. Each is `tutoring.kyc.consent.<version>.<part>`. */
const CONSENT_PARTS = ['purpose', 'data', 'access', 'retention', 'rights'] as const;

/**
 * Step 1 of identity verification: read and explicitly accept the PDPA consent, which opens the verification case. The text
 * lives in the dictionaries under the version the server announces (`consentVersion`); the server stores the version and the
 * time of acceptance. Nothing is pre-ticked and the button stays off until the box is ticked.
 *
 * If the dictionaries have no text for the announced version, the step refuses to continue (rather than let someone accept
 * words they cannot read) - ship the new text together with the new version.
 */
@Component({
  selector: 'app-kyc-consent-step',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, Button, Checkbox, TutorProblem],
  templateUrl: './kyc-consent-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorShieldCheck })],
  host: { class: 'block' },
})
export class KycConsentStep {
  private readonly api = inject(TutoringKycApiService);
  private readonly i18n = inject(TranslationService);

  /** Version of the consent text to show and to send back. */
  readonly consentVersion = input.required<string>();
  /** The case has been opened (or the server says one already is): the owner should reload the status. */
  readonly started = output<void>();

  /** Never pre-ticked: acceptance is an explicit act. */
  protected readonly consent = new FormControl(false, { nonNullable: true });
  protected readonly accepted = toSignal(this.consent.valueChanges, { initialValue: false });
  protected readonly submitting = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly parts = CONSENT_PARTS;
  protected readonly titleKey = computed(() => `tutoring.kyc.consent.${this.consentVersion()}.title`);
  /** Whether the dictionaries actually carry the announced version (a missing key resolves to itself). */
  protected readonly textAvailable = computed(() => this.i18n.t(this.titleKey()) !== this.titleKey());

  protected partKey(part: string): string {
    return `tutoring.kyc.consent.${this.consentVersion()}.${part}`;
  }

  protected start(): void {
    if (!this.accepted() || this.submitting() || !this.textAvailable()) {
      return;
    }
    this.submitting.set(true);
    this.problem.set(null);
    this.api.createCase({ consentVersion: this.consentVersion() }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.started.emit();
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
        // The text moved on, or a case already exists: either way the screen is out of date, so refresh it.
        const reason = tutoringReasonOf(error);
        if (reason === 'tutoring.kyc.consent_outdated' || reason === 'tutoring.kyc.case_open') {
          this.consent.setValue(false);
          this.started.emit();
        }
      },
    });
  }
}
