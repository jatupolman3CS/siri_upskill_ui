import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorPlus, phosphorTrash } from '@ng-icons/phosphor-icons/regular';
import { map, startWith } from 'rxjs';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { InputField } from '../../../../../shared/input/input';
import { TUTOR_DISPUTE_LIMITS, type TutorEvidenceRow, tutorEvidenceRowIssue } from './tutor-feedback-form.util';

type EvidenceGroup = FormGroup<{ url: FormControl<string>; label: FormControl<string> }>;

function newGroup(): EvidenceGroup {
  return new FormGroup({ url: new FormControl('', { nonNullable: true }), label: new FormControl('', { nonNullable: true }) });
}

/**
 * Tutor-facing evidence links field for disputes.
 */
@Component({
  selector: 'app-tutor-evidence-links-field',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, Button, InputField],
  templateUrl: './tutor-evidence-links-field.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorPlus, phosphorTrash })],
  host: { class: 'block' },
})
export class TutorEvidenceLinksField {
  private readonly i18n = inject(TranslationService);

  readonly max = input<number>(TUTOR_DISPUTE_LIMITS.maxLinks);
  readonly showErrors = input(false);
  readonly rowsChange = output<readonly TutorEvidenceRow[]>();

  protected readonly array = new FormArray<EvidenceGroup>([]);
  private readonly rows = toSignal(
    this.array.valueChanges.pipe(
      map(() => this.array.getRawValue()),
      startWith(this.array.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly canAdd = computed(() => this.rows().length < this.max());
  protected readonly urlMax = TUTOR_DISPUTE_LIMITS.linkUrl;

  constructor() {
    effect(() => this.rowsChange.emit(this.rows()));
  }

  protected add(): void {
    if (this.canAdd()) {
      this.array.push(newGroup());
    }
  }

  protected remove(index: number): void {
    this.array.removeAt(index);
  }

  clear(): void {
    this.array.clear();
  }

  protected urlError(index: number): string | undefined {
    if (!this.showErrors()) {
      return undefined;
    }
    const found = tutorEvidenceRowIssue(this.rows()[index]);
    return found === undefined ? undefined : this.i18n.t(found.key, found.params);
  }
}
