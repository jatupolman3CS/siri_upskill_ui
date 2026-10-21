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
import { DISPUTE_LIMITS, type EvidenceRow, evidenceRowIssue } from '../feedback-form.util';

type EvidenceGroup = FormGroup<{ url: FormControl<string>; label: FormControl<string> }>;

function newGroup(): EvidenceGroup {
  return new FormGroup({ url: new FormControl('', { nonNullable: true }), label: new FormControl('', { nonNullable: true }) });
}

/**
 * The evidence links of a dispute or of a reply: a few https addresses, each with an optional label (P13-14 section 5.4). The
 * server never fetches them, and neither does this field - it only collects the text. It says up front that a link is the only
 * kind of evidence and that the other side will see the host before following it. Per row it shows what the server would refuse
 * (not https, a private host, too long); the server remains the judge. The rows are reported through `rowsChange` on every edit;
 * the parent decides when to show errors (`showErrors`, after a submit attempt) and may empty the field with {@link clear}.
 */
@Component({
  selector: 'app-evidence-links-field',
  imports: [ReactiveFormsModule, NgIcon, TranslatePipe, Button, InputField],
  templateUrl: './evidence-links-field.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorPlus, phosphorTrash })],
  host: { class: 'block' },
})
export class EvidenceLinksField {
  private readonly i18n = inject(TranslationService);

  /** How many links may still be added in total (the case allows ten, counting what is already on it). */
  readonly max = input<number>(DISPUTE_LIMITS.maxLinks);
  readonly showErrors = input(false);
  readonly rowsChange = output<readonly EvidenceRow[]>();

  protected readonly array = new FormArray<EvidenceGroup>([]);
  private readonly rows = toSignal(
    this.array.valueChanges.pipe(
      map(() => this.array.getRawValue()),
      startWith(this.array.getRawValue()),
    ),
    { requireSync: true },
  );
  protected readonly canAdd = computed(() => this.rows().length < this.max());
  protected readonly urlMax = DISPUTE_LIMITS.linkUrl;

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

  /** Empties the field (after a reply went through). */
  clear(): void {
    this.array.clear();
  }

  protected urlError(index: number): string | undefined {
    if (!this.showErrors()) {
      return undefined;
    }
    const found = evidenceRowIssue(this.rows()[index]);
    return found === undefined ? undefined : this.i18n.t(found.key, found.params);
  }
}
