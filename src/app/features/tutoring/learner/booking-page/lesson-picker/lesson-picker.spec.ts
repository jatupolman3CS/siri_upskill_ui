import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { BookingPreselection } from '../../../data/tutoring-booking.util';
import { publicTutor, slotsResponse } from '../../testing/learner-fixtures';
import { LessonPicker, type LessonSelection } from './lesson-picker';

describe('LessonPicker', () => {
  let fixture: ComponentFixture<LessonPicker>;
  let httpMock: HttpTestingController;
  let emitted: (LessonSelection | null)[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    TestBed.configureTestingModule({
      imports: [LessonPicker],
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LessonPicker);
    emitted = [];
    fixture.componentInstance.selectionChange.subscribe((lesson) => emitted.push(lesson));
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  async function start(preselection: BookingPreselection): Promise<void> {
    fixture.componentRef.setInput('tutor', publicTutor());
    fixture.componentRef.setInput('preselection', preselection);
    await settle();
    fixture.detectChanges();
    TestBed.tick();
  }

  /** Resolved resources reach effects (pre-selection, emission) one change-detection round later. */
  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round += 1) {
      fixture.detectChanges();
      TestBed.tick();
      await Promise.resolve();
    }
  }

  const slotRequests = () => httpMock.match((req) => req.url.endsWith('/slots'));
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('asks for the calendar window that contains the pre-selected time, counted in Bangkok days from today', async () => {
    // 2026-10-30T11:00Z is Friday 30 Oct 18:00 in Bangkok: 16 days after today (14 Oct) = the third window.
    await start({ offeringId: 'off-physics', startsAtUtc: '2026-10-30T11:00:00Z', durationMinutes: 60, format: 'OneOnOne', trial: false });

    const [request] = slotRequests();
    expect(request.request.params.get('from')).toBe('2026-10-27T17:00:00Z');
    expect(request.request.params.get('to')).toBe('2026-11-03T17:00:00Z');
    request.flush(slotsResponse(['2026-10-30T11:00:00Z']));
  });

  it('emits null until a time is chosen, then the complete lesson with the server quote - and nothing computed here', async () => {
    await start({ offeringId: 'off-physics', startsAtUtc: '2026-10-20T11:00:00Z', durationMinutes: 90, format: 'OneOnOne', trial: false });

    expect(emitted.at(-1) ?? null).toBeNull();
    slotRequests()[0].flush(
      slotsResponse(['2026-10-20T11:00:00Z'], { durationMinutes: 90, quote: { amount: 675, currency: 'THB', durationMinutes: 90, hourlyRate: 450, isFree: false } }),
    );
    await settle();

    const lesson = emitted.at(-1);
    expect(lesson).toMatchObject({ offeringId: 'off-physics', format: 'OneOnOne', isTrial: false, durationMinutes: 90 });
    expect(lesson?.slot.startsAtUtc).toBe('2026-10-20T11:00:00Z');
    expect(lesson?.quote.amount).toBe(675);
  });

  it('starts a trial lesson with the offering trial length and without a duration choice', async () => {
    await start({ offeringId: 'off-physics', trial: true });

    const [request] = slotRequests();
    expect(request.request.params.get('trial')).toBe('true');
    expect(request.request.params.get('durationMinutes')).toBe('30');
    expect(Array.from(root().querySelectorAll('app-select label')).some((label) => label.textContent?.includes('Lesson length'))).toBe(false);
    request.flush(slotsResponse([], { isTrial: true, durationMinutes: 30, quote: { amount: 0, currency: 'THB', durationMinutes: 30, hourlyRate: null, isFree: true } }));
  });

  it('falls back to the first offering and a one-hour lesson when the pre-selection does not fit', async () => {
    await start({ offeringId: 'unknown-offering', durationMinutes: 75, format: 'Group', trial: true });

    const [request] = slotRequests();
    expect(request.request.params.get('offeringId')).toBe('off-physics');
    expect(request.request.params.get('durationMinutes')).toBe('60');
    // Group is possible for this offering, so the requested format is kept; a trial cannot be combined with it.
    expect(request.request.params.get('format')).toBe('Group');
    expect(request.request.params.has('trial')).toBe(false);
    request.flush(slotsResponse([]));
  });

  it('forgets a trial on dropTrial() and asks for the regular lesson again', async () => {
    await start({ offeringId: 'off-physics', trial: true });
    slotRequests()[0].flush(slotsResponse([], { isTrial: true, durationMinutes: 30 }));
    await settle();

    fixture.componentInstance.dropTrial();
    await settle();

    const [request] = slotRequests();
    expect(request.request.params.has('trial')).toBe(false);
    request.flush(slotsResponse([]));
  });

  it('re-reads the calendar on reload() and forgets the chosen time', async () => {
    await start({ offeringId: 'off-physics', startsAtUtc: '2026-10-20T11:00:00Z', durationMinutes: 60, format: 'OneOnOne', trial: false });
    slotRequests()[0].flush(slotsResponse(['2026-10-20T11:00:00Z']));
    await settle();
    expect(emitted.at(-1)).not.toBeNull();

    fixture.componentInstance.reload();
    await settle();

    expect(emitted.at(-1)).toBeNull();
    slotRequests()[0].flush(slotsResponse([]));
  });
});
