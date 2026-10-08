import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import type { DeliveryFormat } from '../../../live/data/live.models';
import type { FormatFacet } from '../../data/course-api.models';

const FORMATS: readonly DeliveryFormat[] = ['OnDemand', 'Live', 'Hybrid'];

/** Validates a raw query-string value — a hand-edited `?format=foo` must not reach the API or the UI as a "format". */
export function parseDeliveryFormat(value: string | null): DeliveryFormat | null {
  return FORMATS.find((format) => format === value) ?? null;
}

/**
 * "Learning format" filter for the catalog sidebar. Stateless: the page owns the selection (it lives in the URL, like every
 * other catalog filter) and this only reports a click. Counts come from the search response's `facets.formats`; an option
 * with no matches is disabled unless it is the one currently selected (so it can still be switched off).
 */
@Component({
  selector: 'app-course-format-filter',
  imports: [TranslatePipe],
  templateUrl: './course-format-filter.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class CourseFormatFilter {
  /** Two-way: the page binds it to the URL-derived value and reacts to `selectedChange`. */
  readonly selected = model<DeliveryFormat | null>(null);
  /** `undefined` = the API sent no format facets (older server): show the options without counts. */
  readonly facets = input<readonly FormatFacet[] | undefined>(undefined);

  protected readonly options = computed(() => {
    const facets = this.facets();
    return FORMATS.map((format) => {
      const count = facets ? (facets.find((facet) => facet.format === format)?.count ?? 0) : null;
      return { format, count, disabled: count === 0 && this.selected() !== format };
    });
  });

  protected toggle(format: DeliveryFormat): void {
    this.selected.set(this.selected() === format ? null : format);
  }
}
