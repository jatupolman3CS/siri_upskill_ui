import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import type { RosterItem } from '../../../data/live-instructor.models';
import { SessionRoster } from './session-roster';

registerLocaleData(localeTh);

const URL = '/api/live/instructor/sessions/s1/roster';

const row = (overrides: Partial<RosterItem> = {}): RosterItem => ({
  userId: 'u1',
  displayName: 'Somchai Jaidee',
  emailMasked: 's***@g***.com',
  inviteStatus: 'Invited',
  joined: true,
  firstJoinedAtUtc: '2026-10-08T02:50:00Z',
  joinCount: 2,
  ...overrides,
});

const response = (items: RosterItem[], extra: Record<string, number> = {}) => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  ...extra,
});

describe('SessionRoster', () => {
  let fixture: ComponentFixture<SessionRoster>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SessionRoster);
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const flush = async (body: ReturnType<typeof response>) => {
    httpMock.expectOne((r) => r.url === URL).flush(body);
    await settle();
  };

  it('starts on "All", page 1, and shows the masked email — never a full address', async () => {
    await settle();
    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('filter')).toBe('all');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(response([row(), row({ userId: 'u2', displayName: null, emailMasked: null, joined: false, firstJoinedAtUtc: null, joinCount: 0, inviteStatus: null })]));
    await settle();

    expect(text()).toContain('s***@g***.com');
    expect(text()).toContain('Somchai Jaidee');
    expect(text()).toContain('Unknown name');
    expect(text()).toContain('Joined');
    expect(text()).toContain('Not joined');
    expect(text()).toContain('2 times');
    expect(text()).toContain('Invited');
    expect(text()).not.toMatch(/@gmail\.com/);
  });

  it('choosing a filter refetches with it from page 1 and marks the active filter', async () => {
    await settle();
    await flush(response([row()], { page: 2, totalPages: 3 }));

    const notJoined = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Not joined') as HTMLButtonElement;
    notJoined.click();
    await settle();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('filter')).toBe('notJoined');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(response([row({ joined: false, joinCount: 0, firstJoinedAtUtc: null })]));
    await settle();
    expect(notJoined.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a filter-specific empty state', async () => {
    await settle();
    await flush(response([]));
    expect(text()).toContain('No learners are enrolled or invited');

    const joined = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Joined') as HTMLButtonElement;
    joined.click();
    await settle();
    await flush(response([]));
    expect(text()).toContain('No learner has joined yet');
  });

  it('paginates when there is more than one page', async () => {
    await settle();
    await flush(response([row()], { totalCount: 60, totalPages: 3 }));

    const next = Array.from(root().querySelectorAll('button')).find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('next')) as HTMLButtonElement;
    next.click();
    await settle();
    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('page')).toBe('2');
    req.flush(response([row()], { page: 2, totalCount: 60, totalPages: 3 }));
    await settle();
  });

  it('shows an error state with retry', async () => {
    await settle();
    httpMock.expectOne((r) => r.url === URL).flush({}, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(text()).toContain('Could not load the attendance list');

    (Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Try again')) as HTMLButtonElement).click();
    await settle();
    await flush(response([row()]));
    expect(text()).toContain('Somchai Jaidee');
  });
});
