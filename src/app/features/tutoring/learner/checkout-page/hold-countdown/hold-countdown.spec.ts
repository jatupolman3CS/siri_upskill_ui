import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { HoldCountdown } from './hold-countdown';

describe('HoldCountdown', () => {
  let fixture: ComponentFixture<HoldCountdown>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HoldCountdown] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(HoldCountdown);
  });

  function show(remainingMs: number | null): void {
    fixture.componentRef.setInput('remainingMs', remainingMs);
    fixture.detectChanges();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const timer = (): string => root().querySelector('[role="timer"]')?.textContent?.trim() ?? '';
  const status = (): string => root().querySelector('[role="status"]')?.textContent?.trim() ?? '';

  it('renders nothing when the booking has no hold', () => {
    show(null);

    expect(root().querySelector('[role="timer"]')).toBeNull();
    expect(root().querySelector('[role="status"]')).toBeNull();
  });

  it('shows the time left as m:ss in a timer', () => {
    show(14 * 60_000 + 5_000);

    expect(timer()).toBe('Time left: 14:05');
  });

  it('changes the announced status only when the countdown crosses a stage, not every second', () => {
    show(10 * 60_000);
    const plenty = status();
    expect(plenty).toContain('Your time is held');

    show(9 * 60_000 + 59_000);
    expect(status()).toBe(plenty);

    show(4 * 60_000);
    expect(status()).toBe('Five minutes left to pay.');
    show(3 * 60_000 + 58_000);
    expect(status()).toBe('Five minutes left to pay.');

    show(30_000);
    expect(status()).toBe('One minute left to pay.');

    show(0);
    expect(status()).toBe('The time to pay has ended.');
    expect(timer()).toBe('Time left: 0:00');
  });

  it('does not say "your time is held" for a package purchase - only its payment window is open', () => {
    fixture.componentRef.setInput('kind', 'Package');
    show(10 * 60_000);

    expect(status()).toBe('Complete the payment before the countdown ends.');
    show(4 * 60_000);
    expect(status()).toBe('Five minutes left to pay.');
  });

  it('keeps the live ticking number out of the announced region (the timer role is not announced)', () => {
    show(60_000);

    expect(root().querySelector('[role="timer"] [aria-live]')).toBeNull();
    expect(root().querySelector('[role="timer"]')?.getAttribute('aria-live')).toBeNull();
  });
});
