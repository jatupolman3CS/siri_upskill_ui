import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { TutorClassListItem } from '../../../data/tutoring-classes.models';
import { classListItem } from '../../testing/tutor-ops-fixtures';
import { TutorClassCard } from './tutor-class-card';

registerLocaleData(localeTh);

/** The device clock is pinned to the server clock of the fixture (`serverTimeUtc`), so a countdown is exactly the distance to the flag's time. */
const NOW = '2026-10-19T03:00:00Z';

describe('TutorClassCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(NOW));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [TutorClassCard], providers: [provideRouter([])] });
    useTutoringLanguage('en');
  });

  afterEach(() => vi.useRealTimers());

  async function render(item: TutorClassListItem): Promise<{ fixture: ComponentFixture<TutorClassCard>; root: HTMLElement }> {
    const fixture = TestBed.createComponent(TutorClassCard);
    fixture.componentRef.setInput('item', item);
    for (let round = 0; round < 2; round++) {
      fixture.detectChanges();
      TestBed.tick();
      await Promise.resolve();
    }
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const text = (root: HTMLElement): string => root.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const link = (root: HTMLElement, label: string): HTMLAnchorElement | undefined => [...root.querySelectorAll('a')].find((a) => a.textContent?.includes(label));
  const button = (root: HTMLElement, label: string): HTMLButtonElement | undefined => [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

  it('shows the subject, the time in Thailand time, the status, the format and each learner with the grade and the state of their booking', async () => {
    const { root } = await render(
      classListItem({
        learners: [
          { bookingId: 'b-1', nickname: 'Nok', gradeLevel: 'Secondary4', isMinor: true, status: 'Confirmed', disputeId: null },
          { bookingId: 'b-2', nickname: 'Beam', gradeLevel: null, isMinor: false, status: 'Completed', disputeId: null },
        ],
      }),
    );
    expect(root.querySelector('h2')?.textContent?.trim()).toBe('Physics');
    expect(text(root)).toContain('09:00');
    expect(text(root)).toContain('Thailand time');
    expect(text(root)).toContain('Scheduled');
    expect(text(root)).toContain('One-on-one');
    expect(text(root)).toMatch(/Nok · Secondary 4 .*· Confirmed/);
    expect(text(root)).toMatch(/Beam · Completed/);
  });

  it('uses the Thai subject name in Thai', async () => {
    useTutoringLanguage('th');
    const { root } = await render(classListItem());
    expect(root.querySelector('h2')?.textContent?.trim()).toBe('Physics (TH)');
  });

  it('marks a trial lesson, and reports the seats held of a group class (holds included, as the server counts them)', async () => {
    const trial = await render(classListItem({ isTrial: true }));
    expect(text(trial.root)).toContain('Trial lesson');
    const group = await render(classListItem({ format: 'Group', seatsTaken: 3, capacity: 5 }));
    expect(text(group.root)).toContain('3 of 5 seats held');
    const solo = await render(classListItem({ seatsTaken: null, capacity: null }));
    expect(text(solo.root)).not.toContain('seats held');
  });

  describe('Start class', () => {
    it('is a live link to the class page exactly while the server says canStart - whatever the clock says', async () => {
      // Opening time is still 22 hours away on this clock, yet the server's flag wins: the card derives nothing.
      const { root } = await render(classListItem({ canStart: true }));
      expect(link(root, 'Start class')?.getAttribute('href')).toBe('/instructor/tutoring/classes/s-1');
      expect(button(root, 'Start class')).toBeUndefined();
      expect(text(root)).not.toContain('Starting opens in');
    });

    it('is switched off before it opens, and counts down to the time the server gave', async () => {
      const { root } = await render(classListItem({ canStart: false, startOpensAtUtc: '2026-10-19T04:00:00Z' }));
      expect(link(root, 'Start class')).toBeUndefined();
      expect(button(root, 'Start class')?.disabled).toBe(true);
      expect(text(root)).toContain('Starting opens in');
      expect(root.querySelector('app-live-countdown')?.textContent?.trim()).toBe('1h 0m');
    });

    it('is switched off, without a made-up reason, when the opening time has passed but the server still says no (for example a suspended tutor)', async () => {
      const { root } = await render(classListItem({ canStart: false, startOpensAtUtc: '2026-10-19T02:00:00Z' }));
      expect(button(root, 'Start class')?.disabled).toBe(true);
      expect(text(root)).not.toContain('Starting opens in');
    });

    it('is not offered at all for a class that is not scheduled', async () => {
      const { root } = await render(classListItem({ status: 'Completed', canStart: false, startOpensAtUtc: null, completeOpensAtUtc: null }));
      expect(text(root)).not.toContain('Start class');
      expect(text(root)).not.toContain('Finish class');
      expect(button(root, 'Cancel class')).toBeUndefined();
    });
  });

  describe('Finish class and write summary', () => {
    it('is a live link to the class page while the server says canComplete', async () => {
      const { root } = await render(classListItem({ canComplete: true, learnerPresent: true }));
      expect(link(root, 'Finish class and write summary')?.getAttribute('href')).toBe('/instructor/tutoring/classes/s-1');
      expect(text(root)).not.toContain('No learner has joined');
    });

    it('says that nobody has joined yet when that is what keeps it off', async () => {
      const { root } = await render(classListItem({ canComplete: false, learnerPresent: false, completeOpensAtUtc: '2026-10-19T02:00:00Z' }));
      expect(button(root, 'Finish class and write summary')?.disabled).toBe(true);
      expect(text(root)).toContain('No learner has joined the room yet');
    });

    it('counts down to the time it opens, and does not claim a missing learner when one is present', async () => {
      const { root } = await render(classListItem({ canComplete: false, learnerPresent: true, completeOpensAtUtc: '2026-10-19T03:30:00Z' }));
      expect(text(root)).toContain('Finishing opens in');
      expect(text(root)).not.toContain('No learner has joined');
    });
  });

  describe('what is waiting for the tutor', () => {
    it('points at the lesson summary that is still owed, with the time up to which it can be written', async () => {
      const { root } = await render(
        classListItem({ status: 'Completed', needsSummary: true, summaryEditableUntilUtc: '2026-10-27T03:00:00Z', startOpensAtUtc: null, completeOpensAtUtc: null, room: null }),
      );
      expect(text(root)).toContain('The lesson summary for this class has not been written yet.');
      expect(text(root)).toContain('You can write it until');
      expect(text(root)).toContain('27 Oct');
      expect(link(root, 'Write the summary')?.getAttribute('href')).toBe('/instructor/tutoring/classes/s-1');
    });

    it('says nothing about a summary when none is owed', async () => {
      const { root } = await render(classListItem({ status: 'Completed', needsSummary: false, startOpensAtUtc: null, completeOpensAtUtc: null }));
      expect(text(root)).not.toContain('summary');
    });

    it('shows the room state and a way to fix it when the server says the tutor has to act', async () => {
      const { root } = await render(classListItem({ room: { state: 'AwaitingLink', needsAction: 'PasteLink' } }));
      expect(text(root)).toContain('Needs a room link');
      expect(link(root, 'Fix the room')?.getAttribute('href')).toBe('/instructor/tutoring/classes/s-1');
    });

    it('shows a ready room without a fix-it link, and nothing when there is no room information', async () => {
      const ready = await render(classListItem({ room: { state: 'Ready', needsAction: 'None' } }));
      expect(text(ready.root)).toContain('Room is ready');
      expect(link(ready.root, 'Fix the room')).toBeUndefined();
      const none = await render(classListItem({ room: null }));
      expect(text(none.root)).not.toContain('Room is');
      expect(text(none.root)).not.toContain('Needs a room link');
    });

    it('does not show the room of a class that is no longer scheduled', async () => {
      const { root } = await render(classListItem({ status: 'Cancelled', room: { state: 'Cancelled', needsAction: 'None' } }));
      expect(text(root)).not.toContain('Room');
    });
  });

  it('asks to cancel a scheduled class by its id, leaving the quote, the reason and the receipt to the dialog', async () => {
    const { fixture, root } = await render(classListItem({ sessionId: 's-9' }));
    const asked = vi.fn();
    fixture.componentInstance.cancelRequested.subscribe(asked);
    button(root, 'Cancel class')!.click();
    expect(asked).toHaveBeenCalledWith('s-9');
  });

  it('always leads to the class page', async () => {
    const { root } = await render(classListItem({ status: 'Completed', startOpensAtUtc: null, completeOpensAtUtc: null }));
    expect(link(root, 'Open class')?.getAttribute('href')).toBe('/instructor/tutoring/classes/s-1');
  });

  it('treats a status it does not know as a closed class rather than inventing a state', async () => {
    const { root } = await render(classListItem({ status: 'FutureStatus' as never, startOpensAtUtc: null, completeOpensAtUtc: null }));
    expect(text(root)).toContain('Cancelled');
    expect(text(root)).not.toContain('Start class');
  });

  it('tells the list to read again at the moment a countdown reaches zero on the server clock', async () => {
    const opensAt = new Date(Date.parse(NOW) + 1_500).toISOString();
    const { fixture } = await render(classListItem({ canStart: false, startOpensAtUtc: opensAt }));
    const reached = vi.fn();
    fixture.componentInstance.windowReached.subscribe(reached);
    expect(reached).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_500);

    expect(reached).toHaveBeenCalledTimes(1);
  });

  describe('dispute links', () => {
    it('deep-links directly to dispute detail when learner has disputeId', async () => {
      const { root } = await render(
        classListItem({
          learners: [
            { bookingId: 'b-1', nickname: 'Nok', gradeLevel: null, isMinor: false, status: 'Disputed', disputeId: 'dsp-123' },
          ],
        }),
      );
      const disputeLink = link(root, 'Dispute Exists');
      expect(disputeLink?.getAttribute('href')).toBe('/instructor/tutoring/disputes/dsp-123');
    });

    it('falls back to dispute list link when learner status is Disputed without disputeId', async () => {
      const { root } = await render(
        classListItem({
          learners: [
            { bookingId: 'b-1', nickname: 'Nok', gradeLevel: null, isMinor: false, status: 'Disputed', disputeId: null },
          ],
        }),
      );
      const disputeLink = link(root, 'Dispute Exists');
      expect(disputeLink?.getAttribute('href')).toBe('/instructor/tutoring/disputes');
    });
  });
});
