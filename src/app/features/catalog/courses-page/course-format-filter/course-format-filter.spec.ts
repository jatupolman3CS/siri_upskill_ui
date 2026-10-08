import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../core/i18n/translation.service';
import type { DeliveryFormat } from '../../../live/data/live.models';
import type { FormatFacet } from '../../data/course-api.models';
import { CourseFormatFilter } from './course-format-filter';

describe('CourseFormatFilter', () => {
  let fixture: ComponentFixture<CourseFormatFilter>;
  let emitted: (DeliveryFormat | null)[];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(TranslationService).setLocale('en');
    fixture = TestBed.createComponent(CourseFormatFilter);
    emitted = [];
    fixture.componentInstance.selected.subscribe((value) => emitted.push(value));
  });

  const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  const set = (selected: DeliveryFormat | null, facets: readonly FormatFacet[] | undefined) => {
    fixture.componentRef.setInput('selected', selected);
    fixture.componentRef.setInput('facets', facets);
    fixture.detectChanges();
  };

  it('lists all three formats with their counts', () => {
    set(null, [{ format: 'OnDemand', count: 9 }, { format: 'Live', count: 2 }, { format: 'Hybrid', count: 1 }]);
    const counts = buttons().map((b) => /\((\d+)\)\s*$/.exec(b.textContent ?? '')?.[1]);
    expect(counts).toEqual(['9', '2', '1']);
    expect(buttons()[0].textContent).toContain('Self-paced');
    expect(buttons()[1].textContent).toContain('Live');
  });

  it('shows no counts when the API sent no format facets', () => {
    set(null, undefined);
    expect(buttons().every((b) => !/\(\d+\)/.test(b.textContent ?? ''))).toBe(true);
    expect(buttons().every((b) => !b.disabled)).toBe(true);
  });

  it('disables an option with no matches, unless it is the selected one (so it can be switched off)', () => {
    set('Hybrid', [{ format: 'Live', count: 2 }]);
    const byLabel = (label: string) => buttons().find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
    expect(byLabel('Self-paced').disabled).toBe(true);
    expect(byLabel('Hybrid').disabled).toBe(false);
    expect(byLabel('Live').disabled).toBe(false);
  });

  it('clicking an option selects it; clicking the selected option clears it', () => {
    set(null, [{ format: 'Live', count: 2 }]);
    (buttons().find((b) => b.textContent?.includes('Live')) as HTMLButtonElement).click();
    expect(emitted).toEqual(['Live']);

    set('Live', [{ format: 'Live', count: 2 }]);
    (buttons().find((b) => b.textContent?.includes('Live')) as HTMLButtonElement).click();
    expect(emitted).toEqual(['Live', null]);
  });

  it('exposes the selection to assistive tech via aria-pressed', () => {
    set('Live', [{ format: 'Live', count: 2 }]);
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });
});
