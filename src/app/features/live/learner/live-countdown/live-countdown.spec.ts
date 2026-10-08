import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../core/i18n/translation.service';
import { LiveCountdown } from './live-countdown';

const NOW = Date.parse('2026-10-08T02:00:00Z');

describe('LiveCountdown', () => {
  let fixture: ComponentFixture<LiveCountdown>;

  function create(targetUtc: string, offsetMs = 0): HTMLElement {
    fixture = TestBed.createComponent(LiveCountdown);
    fixture.componentRef.setInput('targetUtc', targetUtc);
    fixture.componentRef.setInput('offsetMs', offsetMs);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    TestBed.configureTestingModule({ imports: [LiveCountdown] });
    TestBed.inject(TranslationService).setLocale('en');
  });

  afterEach(() => vi.useRealTimers());

  it('is a timer that is explicitly not a live region', () => {
    const root = create('2026-10-08T02:45:00Z');
    expect(root.getAttribute('role')).toBe('timer');
    expect(root.getAttribute('aria-live')).toBe('off');
  });

  it('shows hours and minutes while far away and counts down second by second near the end', () => {
    const root = create('2026-10-08T03:30:00Z');
    fixture.detectChanges();
    expect(root.textContent).toBe('1h 30m');

    vi.setSystemTime(Date.parse('2026-10-08T03:29:30Z'));
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(root.textContent).toBe('29s');
  });

  it('follows the server-corrected clock', () => {
    // The device clock is 10 s behind the server, so 45 minutes on the device is only 44m50s of real time.
    const root = create('2026-10-08T02:45:00Z', 10_000);
    fixture.detectChanges();
    expect(root.textContent).toBe('44m 50s');
  });

  it('emits reached exactly once when the target arrives, and not again on later ticks', () => {
    create('2026-10-08T02:00:03Z');
    const reached = vi.fn();
    fixture.componentInstance.reached.subscribe(reached);
    fixture.detectChanges();

    vi.setSystemTime(Date.parse('2026-10-08T02:00:04Z'));
    vi.advanceTimersByTime(1000);
    expect(reached).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.parse('2026-10-08T02:00:07Z'));
    vi.advanceTimersByTime(3000);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('never fires reached for an unparseable target', () => {
    create('not-a-date');
    const reached = vi.fn();
    fixture.componentInstance.reached.subscribe(reached);
    fixture.detectChanges();
    vi.advanceTimersByTime(5000);
    expect(reached).not.toHaveBeenCalled();
  });

  it('stops ticking once destroyed', () => {
    create('2026-10-08T03:00:00Z');
    fixture.detectChanges();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    fixture.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });
});
