import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { type Route, cancellationQuote, classListItem, paged, settleWith } from '../testing/tutor-ops-fixtures';
import { TutorClassesPage } from './tutor-classes-page';

registerLocaleData(localeTh);

const LIST_URL = '/api/tutoring/tutor/classes';

describe('TutorClassesPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-19T03:00:00Z'));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring/classes', component: TutorClassesPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string): HTMLButtonElement => [...page().querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
  const buttonContaining = (label: string): HTMLButtonElement => [...page().querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;

  /** A click navigates fire-and-forget (`router.navigate`): give the navigation a macrotask to finish before reading what the page asked for. */
  const afterNavigation = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  async function open(reply: unknown = paged([classListItem()]), status?: number, url = '/instructor/tutoring/classes') {
    const routes: readonly Route[] = [{ url: LIST_URL, reply, status }];
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, TutorClassesPage);
    return { routes, seen: await settleWith(harness, httpMock, routes) };
  }

  it('lists the upcoming classes with subject, time in Thailand time, status and the learners\' nicknames and grades', async () => {
    const { seen } = await open(
      paged([
        classListItem(),
        classListItem({
          sessionId: 's-2',
          status: 'Completed',
          format: 'Group',
          seatsTaken: 2,
          capacity: 4,
          learners: [
            { bookingId: 'b-2', nickname: 'Ploy', gradeLevel: 'Primary6', isMinor: true, status: 'Completed', disputeId: null },
            { bookingId: 'b-3', nickname: 'Beam', gradeLevel: null, isMinor: false, status: 'Completed', disputeId: null },
          ],
        }),
      ]),
    );
    expect(seen[0].request.params.get('scope')).toBe('upcoming');
    expect(seen[0].request.params.get('page')).toBe('1');
    expect(seen[0].request.params.get('pageSize')).toBe('10');
    expect(text()).toContain('Physics');
    expect(text()).toContain('09:00');
    expect(text()).toContain('Thailand time');
    expect(text()).toContain('Scheduled');
    expect(text()).toContain('Completed');
    expect(text()).toContain('Nok');
    expect(text()).toContain('Primary 6');
    expect(text()).toContain('Beam');
    expect(text()).toContain('2 of 4 seats held');
    const links = [...page().querySelectorAll('a')].filter((a) => a.textContent?.includes('Open class')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/instructor/tutoring/classes/s-1', '/instructor/tutoring/classes/s-2']);
  });

  it('offers Start and Finish from the server\'s flags: on for the class that can, off - with the time it opens - for the one that cannot yet', async () => {
    await open(
      paged([
        classListItem({ sessionId: 's-now', canStart: true, canComplete: false, learnerPresent: false, completeOpensAtUtc: '2026-10-19T05:00:00Z' }),
        classListItem({ sessionId: 's-later', canStart: false, startOpensAtUtc: '2026-10-19T09:00:00Z' }),
      ]),
    );
    const starts = [...page().querySelectorAll('a')].filter((a) => a.textContent?.includes('Start class')).map((a) => a.getAttribute('href'));
    expect(starts).toEqual(['/instructor/tutoring/classes/s-now']);
    expect(text()).toContain('Starting opens in 6h 0m');
    expect(text()).toContain('Finishing opens in 2h 0m');
    expect(text()).toContain('No learner has joined the room yet');
  });

  it('lists a suspended tutor\'s pending classes with everything switched off by the server\'s own flags (no verified-tutor gate on this screen)', async () => {
    await open(paged([classListItem({ canStart: false, canComplete: false, startOpensAtUtc: '2026-10-19T02:00:00Z', completeOpensAtUtc: '2026-10-19T02:50:00Z', learnerPresent: true })]));
    expect(text()).toContain('Physics');
    expect([...page().querySelectorAll('a')].some((a) => a.textContent?.includes('Start class'))).toBe(false);
    expect(buttonContaining('Start class').disabled).toBe(true);
    expect(buttonContaining('Finish class and write summary').disabled).toBe(true);
    expect(buttonContaining('Cancel class')).toBeDefined();
  });

  it('keeps the scope and the page in the address, so Back returns to the same view', async () => {
    const { routes } = await open(paged([classListItem()], { totalCount: 25, totalPages: 3 }));
    button('History').click();
    await afterNavigation();
    let seen = await settleWith(harness, httpMock, routes);
    expect(router.url).toBe('/instructor/tutoring/classes?scope=history');
    expect(seen[0].request.params.get('scope')).toBe('history');
    expect(seen[0].request.params.get('page')).toBe('1');
    expect(page().querySelector('[aria-pressed=true]')?.textContent?.trim()).toBe('History');

    button('Upcoming').click();
    await afterNavigation();
    seen = await settleWith(harness, httpMock, routes);
    expect(router.url).toBe('/instructor/tutoring/classes');
    expect(seen[0].request.params.get('scope')).toBe('upcoming');
  });

  it('opens straight on the scope and page the address names', async () => {
    const { seen } = await open(paged([classListItem({ status: 'Completed' })], { totalCount: 25, page: 2, totalPages: 3 }), undefined, '/instructor/tutoring/classes?scope=history&page=2');
    expect(seen[0].request.params.get('scope')).toBe('history');
    expect(seen[0].request.params.get('page')).toBe('2');
    expect(page().querySelector('[aria-pressed=true]')?.textContent?.trim()).toBe('History');
  });

  it('ignores a scope or a page it does not understand', async () => {
    const { seen } = await open(paged([classListItem()]), undefined, '/instructor/tutoring/classes?scope=everything&page=-3');
    expect(seen[0].request.params.get('scope')).toBe('upcoming');
    expect(seen[0].request.params.get('page')).toBe('1');
  });

  it('shows an empty state that leads to the availability page for upcoming classes, and a plain one for history', async () => {
    const { routes } = await open(paged([]));
    expect(text()).toContain('No upcoming classes');
    expect([...page().querySelectorAll('a')].find((a) => a.textContent?.includes('Check your availability'))?.getAttribute('href')).toBe('/instructor/tutoring/availability');
    button('History').click();
    await afterNavigation();
    await settleWith(harness, httpMock, routes);
    expect(text()).toContain('No past classes yet');
  });

  it('pages through the list, keeping the page in the address', async () => {
    const { routes } = await open(paged([classListItem()], { totalCount: 25, totalPages: 3 }));
    expect(text()).toContain('25 classes in total');
    const next = [...page().querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Next page' || b.textContent?.trim() === '2')!;
    next.click();
    await afterNavigation();
    const seen = await settleWith(harness, httpMock, routes);
    expect(seen[0].request.params.get('page')).toBe('2');
    expect(router.url).toBe('/instructor/tutoring/classes?page=2');
  });

  it('shows an error with a retry that asks again', async () => {
    const { routes } = await open({ status: 500 }, 500);
    expect(text()).toContain('Could not load your classes');
    button('Try again').click();
    const seen = await settleWith(harness, httpMock, [{ ...routes[0], status: undefined, reply: paged([classListItem()]) }]);
    expect(seen).toHaveLength(1);
    expect(text()).toContain('Physics');
  });

  it('reads the list again when a countdown on a card reaches zero, so the flags are the server\'s again', async () => {
    const { routes } = await open(paged([classListItem({ canStart: false, startOpensAtUtc: '2026-10-19T03:00:01Z' })]));
    vi.advanceTimersByTime(2_000);
    const seen = await settleWith(harness, httpMock, [{ ...routes[0], reply: paged([classListItem({ canStart: true })]) }]);
    expect(seen).toHaveLength(1);
    expect([...page().querySelectorAll('a')].some((a) => a.textContent?.includes('Start class'))).toBe(true);
  });

  describe('cancelling from the list', () => {
    it('asks the server what cancelling would cost for THAT class before anything is confirmed, then reads the list again after the cancellation', async () => {
      const { routes } = await open(paged([classListItem({ sessionId: 's-7' })]));
      buttonContaining('Cancel class').click();
      await settleWith(harness, httpMock, [{ url: '/api/tutoring/tutor/classes/s-7/cancellation-quote', reply: cancellationQuote({ sessionId: 's-7' }) }]);
      expect(page().ownerDocument.querySelector('[role=dialog]')).not.toBeNull();
      expect(page().ownerDocument.body.textContent).toContain('Confirm cancellation');
      httpMock.expectNone('/api/tutoring/tutor/classes/s-7/cancel');
      expect(routes).toHaveLength(1);
    });

    it('cancels with a reason, shows the receipt, and the list is read again so the class leaves "upcoming"', async () => {
      const { routes } = await open(paged([classListItem({ sessionId: 's-7' })]));
      buttonContaining('Cancel class').click();
      await settleWith(harness, httpMock, [{ url: '/api/tutoring/tutor/classes/s-7/cancellation-quote', reply: cancellationQuote({ sessionId: 's-7' }) }]);

      const reason = page().ownerDocument.querySelector<HTMLTextAreaElement>('[role=dialog] textarea')!;
      reason.value = 'Family emergency';
      reason.dispatchEvent(new Event('input'));
      await settleWith(harness, httpMock, []);
      [...page().ownerDocument.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find((b) => b.textContent?.includes('Confirm cancellation'))!.click();
      const seen = await settleWith(harness, httpMock, [
        {
          url: '/api/tutoring/tutor/classes/s-7/cancel',
          method: 'POST',
          reply: { sessionId: 's-7', status: 'Cancelled', alreadyCancelled: false, bookings: [], penaltyKind: null, penaltyPoints: 0, reliabilityScore: 92, suspended: false },
        },
        { ...routes[0], reply: paged([]) },
      ]);

      expect(seen.find((request) => request.request.url.endsWith('/s-7/cancel'))!.request.body).toEqual({ reason: 'Family emergency' });
      expect(seen.some((request) => request.request.url === LIST_URL)).toBe(true);
      expect(text()).toContain('No upcoming classes');
    });
  });
});
