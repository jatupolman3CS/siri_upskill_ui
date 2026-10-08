import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TranslationService } from '../../../../core/i18n/translation.service';
import type { MySessionItem } from '../../data/live-learner.models';
import { LiveSessionCard } from './live-session-card';

function session(overrides: Partial<MySessionItem> = {}): MySessionItem {
  return {
    id: 's-1',
    title: 'คาบที่ 1 พื้นฐาน',
    description: null,
    startsAtUtc: '2026-10-08T03:00:00Z',
    endsAtUtc: '2026-10-08T05:00:00Z',
    displayState: 'Upcoming',
    status: 'Scheduled',
    cancelReason: null,
    canJoin: false,
    joinOpensAtUtc: '2026-10-08T02:45:00Z',
    roomReady: true,
    hasRecording: false,
    recordingEpisodeId: null,
    inviteStatus: null,
    ...overrides,
  };
}

describe('LiveSessionCard', () => {
  let fixture: ComponentFixture<LiveSessionCard>;

  function render(item: MySessionItem): HTMLElement {
    fixture = TestBed.createComponent(LiveSessionCard);
    fixture.componentRef.setInput('session', item);
    fixture.componentRef.setInput('courseSlug', 'excel-pro');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function buttonLabelled(root: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LiveSessionCard], providers: [provideRouter([])] });
    TestBed.inject(TranslationService).setLocale('en');
  });

  it('disables the join button while the server says canJoin is false, and never emits join', () => {
    const root = render(session({ canJoin: false }));
    const join = buttonLabelled(root, 'Join class');
    expect(join).toBeDefined();
    expect(join?.disabled).toBe(true);

    const emitted = vi.fn();
    fixture.componentInstance.join.subscribe(emitted);
    join?.click();
    // Even if the control were somehow activated, the component itself refuses to emit for a closed window.
    (fixture.componentInstance as unknown as { onJoin(): void }).onJoin();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('enables the join button only when canJoin is true and emits the session id on click', () => {
    const root = render(session({ displayState: 'Live', canJoin: true }));
    const emitted = vi.fn();
    fixture.componentInstance.join.subscribe(emitted);

    const join = buttonLabelled(root, 'Join class');
    expect(join?.disabled).toBe(false);
    join?.click();
    expect(emitted).toHaveBeenCalledWith('s-1');
  });

  it('shows the status as text, not colour alone', () => {
    const root = render(session({ displayState: 'Live', canJoin: true }));
    expect(root.textContent).toContain('Live now');
  });

  it('for an upcoming session shows when the room opens plus a countdown', () => {
    const root = render(session());
    expect(root.textContent).toContain('Room opens');
    expect(root.querySelector('app-live-countdown')).not.toBeNull();
  });

  it('warns that the room is not ready, without disabling the join button, while live', () => {
    const root = render(session({ displayState: 'Live', canJoin: true, roomReady: false }));
    expect(root.textContent).toContain("isn't ready yet");
    expect(buttonLabelled(root, 'Join class')?.disabled).toBe(false);
  });

  it('offers add-to-calendar for upcoming/live sessions and emits the session id', () => {
    const root = render(session());
    const emitted = vi.fn();
    fixture.componentInstance.addToCalendar.subscribe(emitted);
    buttonLabelled(root, 'Add to calendar')?.click();
    expect(emitted).toHaveBeenCalledWith('s-1');
  });

  it('links an ended session with a recording to the replay episode', () => {
    const root = render(session({ displayState: 'Ended', hasRecording: true, recordingEpisodeId: 'ep-9' }));
    const link = Array.from(root.querySelectorAll('a')).find((a) => a.textContent?.includes('Watch replay'));
    expect(link?.getAttribute('href')).toBe('/learn/excel-pro/ep-9');
    expect(buttonLabelled(root, 'Join class')).toBeUndefined();
    expect(buttonLabelled(root, 'Add to calendar')).toBeUndefined();
  });

  it('tells the learner the recording is pending when an ended session has none yet', () => {
    const root = render(session({ displayState: 'Ended', hasRecording: false }));
    expect(root.textContent).toContain('Waiting for the instructor to upload the recording');
    expect(root.querySelector('a[href^="/learn"]')).toBeNull();
  });

  it('strikes through a cancelled session and shows the reason, with no actions', () => {
    const root = render(session({ displayState: 'Cancelled', status: 'Cancelled', cancelReason: 'Instructor is ill' }));
    expect(root.querySelector('h4')?.classList.contains('line-through')).toBe(true);
    expect(root.textContent).toContain('Instructor is ill');
    expect(root.querySelectorAll('button')).toHaveLength(0);
  });

  it('shows a generic note for a cancelled session without a reason', () => {
    const root = render(session({ displayState: 'Cancelled', status: 'Cancelled', cancelReason: null }));
    expect(root.textContent).toContain('This session was cancelled');
  });
});
