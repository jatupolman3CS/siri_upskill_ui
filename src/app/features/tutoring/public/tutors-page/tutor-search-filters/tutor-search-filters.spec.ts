import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { PublicSubjectItem, TutorSearchFacets, TutorSearchQuery } from '../../../data/tutoring-public.models';
import { TutorSearchFilters } from './tutor-search-filters';

const SUBJECTS: PublicSubjectItem[] = [
  { subjectId: 'sub-sciences', slug: 'sciences', nameTh: 'วิทยาศาสตร์', nameEn: 'Sciences', parentSlug: null, sortOrder: 0 },
  { subjectId: 'sub-physics', slug: 'physics', nameTh: 'ฟิสิกส์', nameEn: 'Physics', parentSlug: 'sciences', sortOrder: 0 },
  { subjectId: 'sub-chemistry', slug: 'chemistry', nameTh: 'เคมี', nameEn: 'Chemistry', parentSlug: 'sciences', sortOrder: 1 },
  { subjectId: 'sub-languages', slug: 'languages', nameTh: 'ภาษา', nameEn: 'Languages', parentSlug: null, sortOrder: 1 },
];

const FACETS: TutorSearchFacets = {
  subjects: [],
  levels: [{ level: 'Primary', count: 3 }],
  curricula: [{ curriculum: 'EP', count: 2 }],
  genders: [{ gender: 'Female', count: 5 }],
  formats: [{ format: 'Group', count: 4 }],
  trialCount: 1,
  hourlyRate: { min: 200, max: 900 },
};

describe('TutorSearchFilters', () => {
  let fixture: ComponentFixture<TutorSearchFilters>;
  let emitted: TutorSearchQuery[];
  let cleared: () => void;

  function setup(query: TutorSearchQuery = {}, extra: Partial<Record<string, unknown>> = {}): HTMLElement {
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(TutorSearchFilters);
    fixture.componentRef.setInput('query', query);
    fixture.componentRef.setInput('subjects', SUBJECTS);
    for (const [name, value] of Object.entries(extra)) {
      fixture.componentRef.setInput(name, value);
    }
    emitted = [];
    cleared = vi.fn() as unknown as () => void;
    fixture.componentInstance.filtersChange.subscribe((next) => emitted.push(next));
    fixture.componentInstance.cleared.subscribe(cleared);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labelled = <T extends HTMLElement>(root: HTMLElement, label: string): T => {
    const element = Array.from(root.querySelectorAll('label')).find((l) => l.textContent?.trim().startsWith(label));
    if (!element) {
      throw new Error(`No label starting with "${label}"`);
    }
    return root.querySelector<T>(`#${element.getAttribute('for')}`)!;
  };

  function choose(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  const applyButtons = (root: HTMLElement): HTMLButtonElement[] =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button[type="submit"]'));

  describe('options', () => {
    it('lists subject groups with their children indented underneath, after an "all subjects" option', () => {
      const root = setup();
      const options = Array.from(labelled<HTMLSelectElement>(root, 'Subject').options).map((o) => [o.value, o.textContent?.trim()]);
      expect(options).toEqual([
        ['', 'All subjects'],
        ['sciences', 'Sciences'],
        ['physics', 'Physics'],
        ['chemistry', 'Chemistry'],
        ['languages', 'Languages'],
      ]);
      expect(labelled<HTMLSelectElement>(root, 'Subject').options[2].textContent).toMatch(/^\s+Physics/);
    });

    it('keeps an unknown subject slug from the URL selectable so the select never silently shows "All"', () => {
      const root = setup({ subject: 'astronomy' });
      const select = labelled<HTMLSelectElement>(root, 'Subject');
      expect(select.value).toBe('astronomy');
    });

    it('adds facet counts to the option labels once the facets are known', () => {
      const root = setup({}, { facets: FACETS });
      const level = Array.from(labelled<HTMLSelectElement>(root, 'Level').options).map((o) => o.textContent?.trim());
      expect(level).toContain('Primary school (3)');
      // A value with no facet row has no count rather than a misleading (0).
      expect(level).toContain('University');
      expect(Array.from(labelled<HTMLSelectElement>(root, 'Lesson format').options).map((o) => o.textContent?.trim())).toContain('Small group (4)');
    });

    it('translates the options into the active language', () => {
      useTutoringLanguage('th');
      fixture = TestBed.createComponent(TutorSearchFilters);
      fixture.componentRef.setInput('query', {});
      fixture.componentRef.setInput('subjects', SUBJECTS);
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('ทุกวิชา');
      expect(text).toContain('ฟิสิกส์');
    });
  });

  describe('select filters', () => {
    it('applies a select the moment it changes, keeping q, sort and the committed price, and dropping the page', () => {
      const root = setup({ q: 'math', sort: 'rating', priceMax: 500, page: 4 });
      choose(labelled<HTMLSelectElement>(root, 'Level'), 'Adult');

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ q: 'math', sort: 'rating', priceMax: 500, level: 'Adult' });
      expect(emitted[0].page).toBeUndefined();
    });

    it('clears a select back to "any" by emitting the field as undefined', () => {
      const root = setup({ level: 'Adult', gender: 'Female' });
      choose(labelled<HTMLSelectElement>(root, 'Level'), '');
      expect(emitted[0].level).toBeUndefined();
      expect(emitted[0].gender).toBe('Female');
    });

    it('reflects the URL into the controls without emitting (so Back never triggers a navigation)', () => {
      const root = setup({ level: 'Competitive', curriculum: 'International', gender: 'Male', format: 'Group' });
      expect(labelled<HTMLSelectElement>(root, 'Level').value).toBe('Competitive');
      expect(labelled<HTMLSelectElement>(root, 'Curriculum').value).toBe('International');
      expect(labelled<HTMLSelectElement>(root, 'Tutor gender').value).toBe('Male');
      expect(labelled<HTMLSelectElement>(root, 'Lesson format').value).toBe('Group');

      fixture.componentRef.setInput('query', { level: 'Primary' });
      fixture.detectChanges();
      expect(labelled<HTMLSelectElement>(root, 'Level').value).toBe('Primary');
      expect(labelled<HTMLSelectElement>(root, 'Curriculum').value).toBe('');
      expect(emitted).toEqual([]);
    });
  });

  describe('price range', () => {
    it('applies numeric min and max on submit', () => {
      const root = setup({ level: 'Adult' });
      type(labelled<HTMLInputElement>(root, 'Minimum'), '200');
      type(labelled<HTMLInputElement>(root, 'Maximum'), '600');
      expect(emitted).toEqual([]);

      applyButtons(root)[0].click();
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ level: 'Adult', priceMin: 200, priceMax: 600 });
    });

    it('explains and refuses a minimum above the maximum', () => {
      const root = setup();
      type(labelled<HTMLInputElement>(root, 'Minimum'), '900');
      type(labelled<HTMLInputElement>(root, 'Maximum'), '300');
      applyButtons(root)[0].click();
      fixture.detectChanges();

      expect(emitted).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('minimum price cannot be higher');
    });

    it('refuses a negative price and clears the error after a valid apply', () => {
      const root = setup();
      type(labelled<HTMLInputElement>(root, 'Minimum'), '-1');
      applyButtons(root)[0].click();
      fixture.detectChanges();
      expect(emitted).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('numbers from 0');

      type(labelled<HTMLInputElement>(root, 'Minimum'), '100');
      applyButtons(root)[0].click();
      fixture.detectChanges();
      expect(emitted).toHaveLength(1);
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });

    it('clears the price filter when both boxes are emptied', () => {
      const root = setup({ priceMin: 100, priceMax: 400 });
      type(labelled<HTMLInputElement>(root, 'Minimum'), '');
      type(labelled<HTMLInputElement>(root, 'Maximum'), '');
      applyButtons(root)[0].click();
      expect(emitted[0].priceMin).toBeUndefined();
      expect(emitted[0].priceMax).toBeUndefined();
    });
  });

  describe('day and time window', () => {
    it('applies a complete window, keeping Sunday as day 0', () => {
      const root = setup();
      choose(labelled<HTMLSelectElement>(root, 'Day'), '0');
      type(labelled<HTMLInputElement>(root, 'From'), '09:00');
      type(labelled<HTMLInputElement>(root, 'To'), '12:30');
      applyButtons(root)[1].click();

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ day: 0, from: '09:00', to: '12:30' });
    });

    it('refuses a partial window - the server answers 400 for day/from/to unless all three are present', () => {
      const root = setup();
      choose(labelled<HTMLSelectElement>(root, 'Day'), '3');
      applyButtons(root)[1].click();
      fixture.detectChanges();

      expect(emitted).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('day, a start time and an end time together');
    });

    it('refuses a window whose start is not before its end', () => {
      const root = setup();
      choose(labelled<HTMLSelectElement>(root, 'Day'), '1');
      type(labelled<HTMLInputElement>(root, 'From'), '12:00');
      type(labelled<HTMLInputElement>(root, 'To'), '09:00');
      applyButtons(root)[1].click();
      fixture.detectChanges();

      expect(emitted).toEqual([]);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('start time must be earlier');
    });

    it('clears the window when all three fields are empty', () => {
      const root = setup({ day: 2, from: '10:00', to: '11:00' });
      choose(labelled<HTMLSelectElement>(root, 'Day'), '');
      type(labelled<HTMLInputElement>(root, 'From'), '');
      type(labelled<HTMLInputElement>(root, 'To'), '');
      applyButtons(root)[1].click();

      expect(emitted[0].day).toBeUndefined();
      expect(emitted[0].from).toBeUndefined();
      expect(emitted[0].to).toBeUndefined();
    });

    it('explains what the window filter means', () => {
      expect(setup().textContent).toContain('Shows tutors who have set this window as available');
    });
  });

  describe('clear all', () => {
    it('is offered only when a filter is active and raises "cleared"', () => {
      const root = setup({}, { canClear: false });
      expect(Array.from(root.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Clear all filters')).toBe(false);

      fixture.componentRef.setInput('canClear', true);
      fixture.detectChanges();
      Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Clear all filters')!.click();
      expect(cleared).toHaveBeenCalledTimes(1);
    });
  });
});
