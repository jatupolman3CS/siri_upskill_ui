import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { TutorSlot } from '../../data/tutoring-public.models';
import { SlotPicker } from './slot-picker';

/** Wednesday 14 Oct 2026 is the first day of the window; all instants below are Bangkok = UTC+7. */
const START = '2026-10-14';

function slot(startsAtUtc: string, endsAtUtc: string, extra: Partial<TutorSlot> = {}): TutorSlot {
  return { startsAtUtc, endsAtUtc, seatsLeft: 1, joinsExistingGroup: false, ...extra };
}

const WED_0900 = slot('2026-10-14T02:00:00Z', '2026-10-14T03:00:00Z');
const WED_1000 = slot('2026-10-14T03:00:00Z', '2026-10-14T04:00:00Z');
const FRI_1400 = slot('2026-10-16T07:00:00Z', '2026-10-16T08:00:00Z');
const SAT_0030 = slot('2026-10-16T17:30:00Z', '2026-10-16T18:30:00Z'); // 00:30 on Sat 17 Oct in Bangkok

describe('SlotPicker', () => {
  let fixture: ComponentFixture<SlotPicker>;

  function setup(inputs: Partial<Record<string, unknown>> = {}): void {
    fixture = TestBed.createComponent(SlotPicker);
    fixture.componentRef.setInput('slots', [WED_0900, WED_1000, FRI_1400]);
    fixture.componentRef.setInput('windowStartDate', START);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  function refresh(inputs: Partial<Record<string, unknown>>): void {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    fixture.detectChanges();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const tabs = (): HTMLButtonElement[] => Array.from(root().querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const slotButtons = (): HTMLButtonElement[] => Array.from(root().querySelectorAll<HTMLButtonElement>('[role="tabpanel"] button[aria-pressed]'));

  const tabParts = (tab: HTMLElement): (string | null)[] => Array.from(tab.querySelectorAll('span')).map((s) => s.textContent?.trim() ?? null);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    useTutoringLanguage('en');
  });

  describe('day tabs', () => {
    it('renders the seven days as a tablist, showing weekday, day number and how many times each day has', () => {
      setup();

      expect(root().querySelector('[role="tablist"]')).not.toBeNull();
      expect(tabs()).toHaveLength(7);
      expect(tabParts(tabs()[0])).toEqual(['Wed', '14', '2']);
      expect(tabParts(tabs()[1])).toEqual(['Thu', '15', '-']);
      expect(tabParts(tabs()[2])).toEqual(['Fri', '16', '1']);
    });

    it('gives each tab an accessible name that includes the date and how many times are open', () => {
      setup();
      expect(tabs()[0].getAttribute('aria-label')).toBe('Wed 14 Oct, 2 available times');
      expect(tabs()[1].getAttribute('aria-label')).toBe('Thu 15 Oct, 0 available times');
    });

    it('selects the first day that has times, with a single roving tab stop wired to the panel', () => {
      setup({ slots: [FRI_1400] });

      const selected = tabs().filter((tab) => tab.getAttribute('aria-selected') === 'true');
      expect(selected).toHaveLength(1);
      expect(selected[0]).toBe(tabs()[2]);
      expect(tabs().filter((tab) => tab.getAttribute('tabindex') === '0')).toEqual([tabs()[2]]);
      expect(tabs().filter((tab) => tab.getAttribute('tabindex') === '-1')).toHaveLength(6);

      const panel = root().querySelector('[role="tabpanel"]');
      expect(panel?.id).toBe(tabs()[2].getAttribute('aria-controls'));
      expect(panel?.getAttribute('aria-labelledby')).toBe(tabs()[2].id);
    });

    it('opens on the day of a pre-selected slot instead of hiding it behind the first day that has times', () => {
      setup({ selected: FRI_1400 });

      const active = tabs().filter((tab) => tab.getAttribute('aria-selected') === 'true');
      expect(active).toEqual([tabs()[2]]);
      expect(slotButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['true']);
    });

    it('lets a person who picked another day keep it even when a slot is pre-selected elsewhere', () => {
      setup({ selected: FRI_1400 });

      tabs()[0].click();
      fixture.detectChanges();

      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
      expect(slotButtons()).toHaveLength(2);
    });

    it('shows the slots of a clicked day and an explanation for an empty day', () => {
      setup();

      tabs()[2].click();
      fixture.detectChanges();
      expect(slotButtons().map((b) => b.textContent?.trim())).toEqual(['14:00']);

      tabs()[1].click();
      fixture.detectChanges();
      expect(slotButtons()).toHaveLength(0);
      expect(root().querySelector('[role="tabpanel"]')?.textContent).toContain('No available times on this day');
    });

    it('moves between days with the arrow keys, Home and End, wrapping at both ends, and moves focus with them', () => {
      setup();
      const key = (name: string): void => {
        const focused = tabs().find((tab) => tab === document.activeElement) ?? tabs()[0];
        focused.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
        fixture.detectChanges();
      };
      const selectedIndex = (): number => tabs().findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
      tabs()[0].focus();
      expect(selectedIndex()).toBe(0);

      key('ArrowRight');
      expect(selectedIndex()).toBe(1);
      expect(document.activeElement).toBe(tabs()[1]);

      key('End');
      expect(selectedIndex()).toBe(6);
      key('ArrowRight');
      expect(selectedIndex()).toBe(0);
      key('ArrowLeft');
      expect(selectedIndex()).toBe(6);
      key('Home');
      expect(selectedIndex()).toBe(0);
      expect(document.activeElement).toBe(tabs()[0]);
    });

    it('ignores keys it does not own so Tab and typing still behave normally', () => {
      setup();
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      tabs()[0].dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('slot buttons', () => {
    it('lists the active day as native toggle buttons showing Bangkok wall-clock time', () => {
      setup();

      expect(slotButtons().map((b) => b.textContent?.trim())).toEqual(['09:00', '10:00']);
      expect(slotButtons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
      expect(slotButtons().every((b) => b.tagName === 'BUTTON')).toBe(true);
    });

    it('describes each slot with date, start and end for assistive technology', () => {
      setup();
      expect(slotButtons()[0].getAttribute('aria-label')).toBe('Wed 14 Oct, 09:00 to 10:00');
    });

    it('selects on click, emits the slot, marks it pressed with a visible check, and deselects on a second click', () => {
      setup();
      const emitted: (TutorSlot | null)[] = [];
      fixture.componentInstance.selected.subscribe((value) => emitted.push(value));

      slotButtons()[1].click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selected()).toEqual(WED_1000);
      expect(slotButtons()[1].getAttribute('aria-pressed')).toBe('true');
      expect(slotButtons()[1].querySelector('ng-icon')).not.toBeNull();
      expect(slotButtons()[0].getAttribute('aria-pressed')).toBe('false');

      slotButtons()[0].click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selected()).toEqual(WED_0900);
      expect(slotButtons()[1].getAttribute('aria-pressed')).toBe('false');

      slotButtons()[0].click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selected()).toBeNull();
      expect(emitted).toEqual([WED_1000, WED_0900, null]);
    });

    it('announces the selection through a polite live region', () => {
      setup();
      slotButtons()[0].click();
      fixture.detectChanges();
      expect(root().querySelector('[role="status"].sr-only')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Selected Wed 14 Oct, 09:00 to 10:00');
    });

    it('files a slot after Bangkok midnight under the next Bangkok day, not its UTC day', () => {
      setup({ slots: [SAT_0030] });
      // 17:30Z on 16 Oct is 00:30 on Sat 17 Oct in Bangkok.
      expect(tabs()[3].getAttribute('aria-selected')).toBe('true');
      expect(slotButtons().map((b) => b.textContent?.trim())).toEqual(['00:30']);
    });

    it('marks group slots with seats left and distinguishes joining an open group from starting a new one', () => {
      const joining = slot('2026-10-14T02:00:00Z', '2026-10-14T03:00:00Z', { seatsLeft: 2, joinsExistingGroup: true });
      const fresh = slot('2026-10-14T05:00:00Z', '2026-10-14T06:00:00Z', { seatsLeft: 4 });
      setup({ slots: [joining, fresh, WED_1000] });

      expect(slotButtons()[0].textContent).toContain('2 left');
      expect(slotButtons()[0].getAttribute('aria-label')).toBe('Wed 14 Oct, 09:00 to 10:00, join an open group, 2 seats left');
      expect(slotButtons()[1].getAttribute('aria-label')).toBe('Wed 14 Oct, 12:00 to 13:00, starts a new group, up to 4 seats');
      expect(slotButtons()[1].textContent).toContain('Group of 4');
      // A plain one-on-one slot carries no seat caption.
      expect(slotButtons()[2].textContent).not.toContain('left');
    });
  });

  describe('week navigation', () => {
    it('shows the Bangkok date range of the window', () => {
      setup();
      expect(root().querySelector('[aria-live="polite"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('14 Oct 2026 - 20 Oct 2026');
    });

    it('emits previousWeek / nextWeek and disables the buttons the parent turns off', () => {
      setup({ canGoPrevious: false, canGoNext: true });
      const previous = root().querySelector<HTMLButtonElement>('button[aria-label="Previous week"]')!;
      const next = root().querySelector<HTMLButtonElement>('button[aria-label="Next week"]')!;
      expect(previous.disabled).toBe(true);
      expect(next.disabled).toBe(false);

      const nextSpy = vi.fn();
      fixture.componentInstance.nextWeek.subscribe(nextSpy);
      next.click();
      expect(nextSpy).toHaveBeenCalledTimes(1);

      refresh({ canGoPrevious: true });
      const previousSpy = vi.fn();
      fixture.componentInstance.previousWeek.subscribe(previousSpy);
      previous.click();
      expect(previousSpy).toHaveBeenCalledTimes(1);
    });

    it('states that every time is Thailand time', () => {
      setup();
      expect(root().textContent).toContain('All times are Thailand time (Asia/Bangkok, UTC+7)');
    });
  });

  describe('states', () => {
    it('shows a busy skeleton while loading and no tabs', () => {
      setup({ loading: true, slots: [] });
      expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(tabs()).toHaveLength(0);
    });

    it('shows the explanation with a retry action when loading failed', () => {
      setup({ failed: true, errorMessage: 'Too many requests.', slots: [] });
      expect(root().textContent).toContain('Could not load available times');
      expect(root().textContent).toContain('Too many requests.');

      const retry = vi.fn();
      fixture.componentInstance.retry.subscribe(retry);
      Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Try again')!.click();
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it('shows a way forward when the whole window is empty, only offering next week when it exists', () => {
      setup({ slots: [], canGoNext: true });
      expect(root().textContent).toContain('No available times in this period');
      const nextWeek = vi.fn();
      fixture.componentInstance.nextWeek.subscribe(nextWeek);
      Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Show next week')!.click();
      expect(nextWeek).toHaveBeenCalledTimes(1);

      refresh({ canGoNext: false });
      expect(Array.from(root().querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Show next week')).toBe(false);
    });
  });

  describe('selection validity', () => {
    it('clears a selected slot that vanished from a refreshed window and says why', () => {
      setup();
      slotButtons()[0].click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selected()).toEqual(WED_0900);

      refresh({ slots: [WED_1000, FRI_1400] });
      expect(fixture.componentInstance.selected()).toBeNull();
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('just taken');
    });

    it('keeps the selection across a refresh that still contains the slot, and keeps the chosen day', () => {
      setup();
      tabs()[2].click();
      fixture.detectChanges();
      slotButtons()[0].click();
      fixture.detectChanges();

      refresh({ slots: [WED_0900, FRI_1400] });
      expect(fixture.componentInstance.selected()).toEqual(FRI_1400);
      expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
      expect(root().querySelector('[role="alert"]')).toBeNull();
    });

    it('does not clear the selection while a refresh is still loading', () => {
      setup();
      slotButtons()[0].click();
      fixture.detectChanges();

      refresh({ loading: true, slots: [] });
      expect(fixture.componentInstance.selected()).toEqual(WED_0900);
    });

    it('clears silently (no "taken" alert) when the user pages to a different week', () => {
      setup();
      slotButtons()[0].click();
      fixture.detectChanges();

      refresh({ windowStartDate: '2026-10-21', slots: [] });
      expect(fixture.componentInstance.selected()).toBeNull();
      expect(root().querySelector('[role="alert"]')).toBeNull();
    });

    it('requires both start and end to match: the same start with another length is a different slot', () => {
      setup();
      slotButtons()[0].click();
      fixture.detectChanges();

      refresh({ slots: [slot('2026-10-14T02:00:00Z', '2026-10-14T03:30:00Z'), WED_1000] });
      expect(fixture.componentInstance.selected()).toBeNull();
    });
  });
});
