import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { BookingListItem } from '../../../data/tutoring-learner.models';
import { listItem } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { MyTutoringPage, pageOf, tabOf } from './my-tutoring-page';

@Component({ template: '' })
class RouteStub {}

function paged(items: readonly BookingListItem[], overrides: object = {}): object {
  return { items, totalCount: items.length, page: 1, pageSize: 10, totalPages: 1, ...overrides };
}

describe('tabOf / pageOf', () => {
  it('reads History from ?tab=history and anything else as Upcoming', () => {
    expect(tabOf('history')).toBe('history');
    expect(tabOf('upcoming')).toBe('upcoming');
    expect(tabOf('<script>')).toBe('upcoming');
    expect(tabOf(null)).toBe('upcoming');
  });

  it('reads a whole page number from 1 and anything else as page 1', () => {
    expect(pageOf('3')).toBe(3);
    expect(pageOf('0')).toBe(1);
    expect(pageOf('-2')).toBe(1);
    expect(pageOf('1.5')).toBe(1);
    expect(pageOf('abc')).toBe(1);
    expect(pageOf(null)).toBe(1);
  });
});

describe('MyTutoringPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'my-tutoring', component: MyTutoringPage },
          { path: 'my-tutoring/bookings/:bookingId', component: RouteStub },
          { path: 'tutors', component: RouteStub },
        ]),
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const LIST = (req: { url: string }): boolean => req.url === '/api/tutoring/bookings/my';

  /** `router.navigate()` is fire-and-forget in the page, so the new address lands a macrotask later. */
  async function navigated(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await settle(harness);
  }

  async function open(url: string, answer: 'items' | 'empty' | 'error' | 'pending', items: readonly BookingListItem[] = [listItem()], extra: object = {}): Promise<void> {
    await harness.navigateByUrl(url, MyTutoringPage);
    await settle(harness);
    if (answer === 'pending') {
      return;
    }
    const request = httpMock.expectOne(LIST);
    if (answer === 'error') {
      request.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    } else {
      request.flush(paged(answer === 'empty' ? [] : items, extra));
    }
    await settle(harness);
  }

  it('shows a busy skeleton while the lessons load, and asks for the upcoming scope first', async () => {
    await open('/my-tutoring', 'pending');

    expect(root().querySelector('[role="status"][aria-label="Loading your lessons"]')).not.toBeNull();
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('scope')).toBe('upcoming');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(paged([]));
  });

  it('lists the lessons as cards and states how many there are', async () => {
    await open('/my-tutoring', 'items', [listItem(), listItem({ bookingId: 'b-2', bookingNo: 'TB-2' })], { totalCount: 2 });

    expect(root().querySelectorAll('app-booking-card')).toHaveLength(2);
    expect(textOf(root())).toContain('2 lessons');
  });

  it('keeps the tabs as an aria-pressed button group with Upcoming pressed', async () => {
    await open('/my-tutoring', 'items');

    const group = root().querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Show lessons');
    const [upcoming, history] = Array.from(group?.querySelectorAll('button') ?? []);
    expect(upcoming.textContent?.trim()).toBe('Upcoming');
    expect(upcoming.getAttribute('aria-pressed')).toBe('true');
    expect(history.getAttribute('aria-pressed')).toBe('false');
  });

  it('switches to History: the URL carries the tab, and the past scope is requested from page 1', async () => {
    await open('/my-tutoring', 'items');

    root().querySelectorAll<HTMLButtonElement>('[role="group"] button')[1].click();
    await navigated();

    expect(TestBed.inject(Router).url).toBe('/my-tutoring?tab=history');
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('scope')).toBe('past');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(paged([listItem({ status: 'Completed' })]));
    await settle(harness);
    expect(root().querySelectorAll('[role="group"] button')[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('opens on the tab and page in the address, so back, reload and a shared link land in the same place', async () => {
    await open('/my-tutoring?tab=history&page=2', 'items', [listItem({ status: 'Completed' })], { page: 2, totalPages: 3, totalCount: 25 });

    expect(root().querySelectorAll('[role="group"] button')[1].getAttribute('aria-pressed')).toBe('true');
    expect(root().querySelector('app-pagination')).not.toBeNull();
  });

  it('asks for the past scope and the page in the address', async () => {
    await harness.navigateByUrl('/my-tutoring?tab=history&page=2', MyTutoringPage);
    await settle(harness);

    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('scope')).toBe('past');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(paged([]));
  });

  it('moves between pages through the address', async () => {
    await open('/my-tutoring', 'items', [listItem()], { totalPages: 3, totalCount: 25 });

    Array.from(root().querySelectorAll<HTMLButtonElement>('app-pagination button')).find((button) => button.textContent?.trim() === '2')?.click();
    await navigated();

    expect(TestBed.inject(Router).url).toBe('/my-tutoring?page=2');
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('page')).toBe('2');
    request.flush(paged([listItem()], { page: 2, totalPages: 3 }));
  });

  it('points an empty Upcoming tab at finding a tutor', async () => {
    await open('/my-tutoring', 'empty');

    expect(textOf(root())).toContain('No upcoming lessons');
    expect(Array.from(root().querySelectorAll('a')).some((a) => a.getAttribute('href') === '/tutors')).toBe(true);
  });

  it('explains an empty History tab without sending the learner anywhere', async () => {
    await open('/my-tutoring?tab=history', 'empty');

    expect(textOf(root())).toContain('No past lessons yet');
  });

  it('shows an error state with a retry that reads the list again', async () => {
    await open('/my-tutoring', 'error');

    expect(textOf(root())).toContain('We could not load your lessons');
    buttonByText(root(), 'Try again')?.click();
    await settle(harness);
    httpMock.expectOne(LIST).flush(paged([listItem()]));
    await settle(harness);

    expect(root().querySelectorAll('app-booking-card')).toHaveLength(1);
  });

  it('reads the list again at the moment the soonest join window opens, so the server\'s canJoin is current', async () => {
    vi.useFakeTimers();
    try {
      // The server clock is exactly the device clock; the window opens 3 seconds from now.
      const now = new Date().toISOString();
      const opensAt = new Date(Date.now() + 3_000).toISOString();
      await open('/my-tutoring', 'items', [listItem({ serverTimeUtc: now, joinOpensAtUtc: opensAt, canJoin: false })]);
      httpMock.expectNone(LIST);

      vi.advanceTimersByTime(4_500);
      await settle(harness);

      const request = httpMock.expectOne(LIST);
      request.flush(paged([listItem({ serverTimeUtc: opensAt, joinOpensAtUtc: opensAt, canJoin: true })]));
      await settle(harness);
      expect(Array.from(root().querySelectorAll('a')).some((a) => a.getAttribute('href')?.endsWith('/join'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks nobody but the server: the page contains no price, refund or entitlement arithmetic', async () => {
    await open('/my-tutoring', 'items', [listItem({ priceAmount: 450, canJoin: false })]);

    expect(textOf(root())).toContain('฿450.00');
  });
});
