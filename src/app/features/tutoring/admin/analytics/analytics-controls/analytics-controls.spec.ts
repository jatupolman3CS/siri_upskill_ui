import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AnalyticsFilters, ReportTab } from '../../data/admin-analytics.util';
import { buttonByText, settle, textOf, typeInto, useEnglish } from '../../testing/spec-helpers';
import { AnalyticsControls } from './analytics-controls';

const TODAY = '2026-10-14';

function filters(overrides: Partial<AnalyticsFilters> = {}): AnalyticsFilters {
  return {
    from: '2026-09-15',
    to: TODAY,
    granularity: 'Day',
    segment: 'All',
    sort: 'Completed',
    top: 20,
    fromMonth: '2025-11',
    toMonth: '2026-10',
    ...overrides,
  };
}

describe('AnalyticsControls', () => {
  let applied: Partial<AnalyticsFilters>[];

  beforeEach(() => {
    useEnglish();
    applied = [];
  });

  async function mount(tab: ReportTab, current: AnalyticsFilters = filters()): Promise<{ fixture: ComponentFixture<AnalyticsControls>; root: HTMLElement }> {
    const fixture = TestBed.createComponent(AnalyticsControls);
    fixture.componentRef.setInput('tab', tab);
    fixture.componentRef.setInput('filters', current);
    fixture.componentRef.setInput('today', TODAY);
    fixture.componentInstance.apply.subscribe((patch) => applied.push(patch));
    await settle(fixture);
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  function dateInputs(root: HTMLElement): HTMLInputElement[] {
    return Array.from(root.querySelectorAll<HTMLInputElement>('input[type="date"]'));
  }

  function selectByLabel(root: HTMLElement, label: string): HTMLSelectElement {
    const labelElement = Array.from(root.querySelectorAll('label')).find((candidate) => candidate.textContent?.trim().startsWith(label));
    const select = labelElement ? root.querySelector<HTMLSelectElement>(`select[id="${labelElement.getAttribute('for')}"]`) : null;
    if (!select) {
      throw new Error(`no select labelled ${label}`);
    }
    return select;
  }

  function choose(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function submit(fixture: ComponentFixture<AnalyticsControls>): Promise<void> {
    (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle(fixture);
  }

  describe('which fields each report has', () => {
    it('gives revenue a period and a step', async () => {
      const { root } = await mount('revenue');

      expect(dateInputs(root)).toHaveLength(2);
      expect(selectByLabel(root, 'Group by')).toBeTruthy();
      expect(root.querySelectorAll('select')).toHaveLength(1);
    });

    it('gives search demand a period and a number of rows', async () => {
      const { root } = await mount('search');

      expect(dateInputs(root)).toHaveLength(2);
      expect(selectByLabel(root, 'Show')).toBeTruthy();
      expect(root.querySelectorAll('select')).toHaveLength(1);
    });

    it('gives the funnel a period and a segment', async () => {
      const { root } = await mount('funnel');

      expect(dateInputs(root)).toHaveLength(2);
      expect(selectByLabel(root, 'Bookings')).toBeTruthy();
    });

    it('gives top tutors a period, a ranking and a number of rows', async () => {
      const { root } = await mount('tutors');

      expect(dateInputs(root)).toHaveLength(2);
      expect(selectByLabel(root, 'Rank by')).toBeTruthy();
      expect(selectByLabel(root, 'Show')).toBeTruthy();
    });

    it('gives retention two month pickers and no dates or quick periods', async () => {
      const { root } = await mount('retention');

      expect(dateInputs(root)).toHaveLength(0);
      expect(selectByLabel(root, 'From month')).toBeTruthy();
      expect(selectByLabel(root, 'To month')).toBeTruthy();
      expect(root.querySelector('[role="group"]')).toBeNull();
    });

    it('gives the identity-check queue no form at all, only a note that it has no period', async () => {
      const { root } = await mount('kyc');

      expect(root.querySelector('form')).toBeNull();
      expect(textOf(root)).toContain('has no period to choose');
    });
  });

  describe('the fields show what the address bar says', () => {
    it('fills the dates and options from the filters', async () => {
      const { root } = await mount('tutors', filters({ from: '2026-08-01', to: '2026-08-31', sort: 'Rating', top: 50 }));

      expect(dateInputs(root).map((input) => input.value)).toEqual(['2026-08-01', '2026-08-31']);
      expect(selectByLabel(root, 'Rank by').value).toBe('Rating');
      expect(selectByLabel(root, 'Show').value).toBe('50');
    });

    it('offers a row count that is in the address bar even when it is not one of the usual three', async () => {
      const { root } = await mount('search', filters({ top: 35 }));

      const values = Array.from(selectByLabel(root, 'Show').options).map((option) => option.value);
      expect(values).toEqual(['10', '20', '35', '50']);
    });

    it('offers 24 months newest first, plus a month that is in the address bar and older', async () => {
      const { root } = await mount('retention', filters({ fromMonth: '2024-06' }));

      const values = Array.from(selectByLabel(root, 'From month').options).map((option) => option.value);
      expect(values[0]).toBe('2026-10');
      expect(values).toContain('2024-11');
      expect(values).toContain('2024-06');
      expect(values).toHaveLength(25);
    });

    it('replaces unsent edits and clears an old complaint when the address bar changes (Back, a preset, a shared link)', async () => {
      const { fixture, root } = await mount('revenue');
      typeInto(dateInputs(root)[0], '2026-10-20');
      await submit(fixture);
      expect(root.querySelector('[role="alert"]')).not.toBeNull();

      fixture.componentRef.setInput('filters', filters({ from: '2026-09-01', to: '2026-09-30' }));
      await settle(fixture);

      expect(dateInputs(root).map((input) => input.value)).toEqual(['2026-09-01', '2026-09-30']);
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe('submitting a period', () => {
    it('hands a valid period and the step to the page', async () => {
      const { fixture, root } = await mount('revenue');
      typeInto(dateInputs(root)[0], '2026-09-20');
      typeInto(dateInputs(root)[1], '2026-10-10');

      await submit(fixture);

      expect(applied).toEqual([{ from: '2026-09-20', to: '2026-10-10', granularity: 'Day' }]);
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });

    it('does not send a period that ends before it starts, and says why', async () => {
      const { fixture, root } = await mount('funnel');
      typeInto(dateInputs(root)[0], '2026-10-10');
      typeInto(dateInputs(root)[1], '2026-10-01');

      await submit(fixture);

      expect(applied).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('The start must not be after the end.');
    });

    it('does not send a period that ends after today', async () => {
      const { fixture, root } = await mount('funnel');
      typeInto(dateInputs(root)[1], '2026-10-15');

      await submit(fixture);

      expect(applied).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('cannot end after today');
    });

    it('asks for both dates when one is cleared', async () => {
      const { fixture, root } = await mount('search');
      typeInto(dateInputs(root)[0], '');

      await submit(fixture);

      expect(applied).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('Enter a start and an end date.');
    });

    it('does not send a period longer than the report allows, and names the limit', async () => {
      const { fixture, root } = await mount('revenue');
      typeInto(dateInputs(root)[0], '2026-01-01');

      await submit(fixture);

      expect(applied).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('at most 92 days');
    });

    it('allows a longer period when the step is a week, and names weeks in the limit when it is exceeded', async () => {
      const { fixture, root } = await mount('revenue');
      choose(selectByLabel(root, 'Group by'), 'Week');
      applied.length = 0;
      typeInto(dateInputs(root)[0], '2025-10-20');
      await submit(fixture);
      expect(applied).toEqual([{ from: '2025-10-20', to: TODAY, granularity: 'Week' }]);

      applied.length = 0;
      typeInto(dateInputs(root)[0], '2025-01-01');
      await submit(fixture);
      expect(applied).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('at most 53 weeks');
    });

    it('shows the complaint beside the start field, not only below the buttons', async () => {
      const { fixture, root } = await mount('revenue');
      typeInto(dateInputs(root)[0], '2026-01-01');

      await submit(fixture);

      const first = root.querySelector('app-input');
      expect(first?.querySelector('[role="alert"]')?.textContent).toContain('at most 92 days');
      expect(first?.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    });
  });

  describe('options apply at once', () => {
    it('sends the step as soon as it is chosen, with the period already in the fields', async () => {
      const { fixture, root } = await mount('revenue');

      choose(selectByLabel(root, 'Group by'), 'Month');
      await settle(fixture);

      expect(applied).toEqual([{ from: '2026-09-15', to: TODAY, granularity: 'Month' }]);
    });

    it('sends the segment', async () => {
      const { fixture, root } = await mount('funnel');

      choose(selectByLabel(root, 'Bookings'), 'Paid');
      await settle(fixture);

      expect(applied).toEqual([{ from: '2026-09-15', to: TODAY, segment: 'Paid' }]);
    });

    it('sends the ranking and the number of rows as a number', async () => {
      const { fixture, root } = await mount('tutors');

      choose(selectByLabel(root, 'Rank by'), 'Booked');
      await settle(fixture);
      choose(selectByLabel(root, 'Show'), '50');
      await settle(fixture);

      expect(applied.at(-1)).toEqual({ from: '2026-09-15', to: TODAY, sort: 'Booked', top: 50 });
      expect(typeof applied.at(-1)?.top).toBe('number');
    });

    it('sends the number of rows for search demand', async () => {
      const { fixture, root } = await mount('search');

      choose(selectByLabel(root, 'Show'), '10');
      await settle(fixture);

      expect(applied).toEqual([{ from: '2026-09-15', to: TODAY, top: 10 }]);
    });

    it('never sends a value that is not one of the choices', async () => {
      const { fixture, root } = await mount('revenue');

      choose(selectByLabel(root, 'Group by'), 'Hour');
      await settle(fixture);

      expect(applied.every((patch) => patch.granularity === 'Day' || patch.granularity === undefined)).toBe(true);
    });
  });

  describe('quick periods', () => {
    it('sends the last 7, 30 or 90 days ending today', async () => {
      const { fixture, root } = await mount('revenue');

      buttonByText(root, 'Last 7 days')?.click();
      await settle(fixture);
      expect(applied.at(-1)).toEqual({ from: '2026-10-08', to: TODAY, granularity: 'Day' });

      buttonByText(root, 'Last 90 days')?.click();
      await settle(fixture);
      expect(applied.at(-1)).toEqual({ from: '2026-07-17', to: TODAY, granularity: 'Day' });
    });

    it('sends 90 days to search demand, which allows exactly 90', async () => {
      const { fixture, root } = await mount('search');

      buttonByText(root, 'Last 90 days')?.click();
      await settle(fixture);

      expect(applied).toEqual([{ from: '2026-07-17', to: TODAY, top: 20 }]);
    });
  });

  describe('retention months', () => {
    it('sends the two months', async () => {
      const { fixture, root } = await mount('retention');
      choose(selectByLabel(root, 'From month'), '2026-01');
      choose(selectByLabel(root, 'To month'), '2026-06');

      await submit(fixture);

      expect(applied).toEqual([{ fromMonth: '2026-01', toMonth: '2026-06' }]);
    });

    it('does not send more than 24 months, and names the limit', async () => {
      const { fixture, root } = await mount('retention', filters({ fromMonth: '2024-06', toMonth: '2026-10' }));

      await submit(fixture);

      expect(applied).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('at most 24 months');
    });

    it('does not send months in the wrong order', async () => {
      const { fixture, root } = await mount('retention');
      choose(selectByLabel(root, 'From month'), '2026-09');
      choose(selectByLabel(root, 'To month'), '2026-03');

      await submit(fixture);

      expect(applied).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('The start must not be after the end.');
    });
  });
});
