import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TranslationService } from '../../../../core/i18n/translation.service';
import type { MyUpcomingSessionItem } from '../../data/live-learner.models';
import { LiveNextSessionChip } from './live-next-session-chip';

function item(overrides: Partial<MyUpcomingSessionItem> = {}): MyUpcomingSessionItem {
  return {
    sessionId: 's-1',
    courseId: 'c-1',
    courseTitle: 'Excel Pro',
    courseSlug: 'excel-pro',
    title: 'คาบที่ 1',
    startsAtUtc: '2026-10-08T03:00:00Z',
    endsAtUtc: '2026-10-08T05:00:00Z',
    displayState: 'Upcoming',
    canJoin: false,
    joinOpensAtUtc: '2026-10-08T02:45:00Z',
    ...overrides,
  };
}

describe('LiveNextSessionChip', () => {
  let fixture: ComponentFixture<LiveNextSessionChip>;

  function render(session: MyUpcomingSessionItem): HTMLElement {
    fixture = TestBed.createComponent(LiveNextSessionChip);
    fixture.componentRef.setInput('session', session);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LiveNextSessionChip], providers: [provideRouter([])] });
    TestBed.inject(TranslationService).setLocale('en');
  });

  it('shows the next session day and Bangkok time, linking to the classroom Live tab', () => {
    const root = render(item());
    // 03:00Z is 10:00 in Asia/Bangkok.
    expect(root.textContent).toContain('Next session: Thu 8 Oct 10:00');
    const link = root.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/learn/excel-pro?tab=live');
  });

  it('offers no join button while the server says the window is closed', () => {
    const root = render(item({ canJoin: false }));
    expect(root.textContent).not.toContain('Join class');
    expect(root.querySelector('a[href="/live/s-1/join"]')).toBeNull();
  });

  it('offers a join link to the join page only when canJoin is true', () => {
    const root = render(item({ displayState: 'Live', canJoin: true }));
    expect(root.textContent).toContain('Live now');
    expect(root.querySelector('a[href="/live/s-1/join"]')).not.toBeNull();
  });
});
