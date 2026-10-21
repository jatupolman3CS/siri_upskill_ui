import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import type { PackagePurchaseSummary } from '../../../data/tutoring-package-purchase.models';
import { activePurchase, packagePurchase } from '../../../testing/package-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { MyPackagesPage } from './my-packages-page';

@Component({ template: '' })
class RouteStub {}

const LIST_URL = '/api/tutoring/packages/my';

function paged(items: readonly PackagePurchaseSummary[], overrides: object = {}): object {
  return { items, totalCount: items.length, page: 1, pageSize: 10, totalPages: 1, ...overrides };
}

describe('MyPackagesPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'my-tutoring/packages', component: MyPackagesPage },
          { path: 'my-tutoring/packages/:purchaseId', component: RouteStub },
          { path: 'my-tutoring', component: RouteStub },
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
  const pill = (label: string): HTMLButtonElement | null =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('[role="group"] button')).find((candidate) => candidate.textContent?.trim() === label) ?? null;

  /** A click starts a router navigation that finishes a macrotask later; the list is read again once it has. */
  async function afterNavigation(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle(harness.fixture);
    await settle(harness.fixture);
  }

  async function open(url: string, answer: object | { status: number }): Promise<void> {
    await harness.navigateByUrl(url, MyPackagesPage);
    await settle(harness.fixture);
    const request = httpMock.expectOne((candidate) => candidate.url === LIST_URL);
    if ('status' in answer) {
      request.flush({ title: 'x' }, { status: answer.status, statusText: 'x' });
    } else {
      request.flush(answer);
    }
    await settle(harness.fixture);
  }

  it('shows a busy skeleton while the packages load', async () => {
    await harness.navigateByUrl('/my-tutoring/packages', MyPackagesPage);
    await settle(harness.fixture);

    expect(root().querySelector('[role="status"][aria-label="Loading your packages"]')).not.toBeNull();
    httpMock.expectOne((candidate) => candidate.url === LIST_URL).flush(paged([]));
  });

  it('asks for the first page with no status and lists a card per purchase', async () => {
    await harness.navigateByUrl('/my-tutoring/packages', MyPackagesPage);
    await settle(harness.fixture);
    const request = httpMock.expectOne((candidate) => candidate.url === LIST_URL);
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.has('status')).toBe(false);
    request.flush(paged([activePurchase(), packagePurchase({ purchaseId: 'pp-2' })]));
    await settle(harness.fixture);

    expect(root().querySelectorAll('app-package-card')).toHaveLength(2);
    expect(textOf(root())).toContain('7 of 10 lessons left');
    expect(textOf(root())).toContain('Pay now');
  });

  it('keeps the status filter and the page in the URL: ?status=Active&page=2 is asked for as such', async () => {
    await harness.navigateByUrl('/my-tutoring/packages?status=Active&page=2', MyPackagesPage);
    await settle(harness.fixture);
    const request = httpMock.expectOne((candidate) => candidate.url === LIST_URL);

    expect(request.request.params.get('status')).toBe('Active');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(paged([activePurchase()], { page: 2, totalPages: 3, totalCount: 21 }));
    await settle(harness.fixture);

    expect(pill('Active')?.getAttribute('aria-pressed')).toBe('true');
    expect(pill('All')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('never sends an unknown status from a hand-edited URL', async () => {
    await harness.navigateByUrl('/my-tutoring/packages?status=Paid', MyPackagesPage);
    await settle(harness.fixture);
    const request = httpMock.expectOne((candidate) => candidate.url === LIST_URL);

    expect(request.request.params.has('status')).toBe(false);
    request.flush(paged([]));
  });

  it('puts the chosen status in the URL and reads the list again from page one', async () => {
    await open('/my-tutoring/packages?page=2', paged([activePurchase()], { page: 2, totalPages: 3 }));

    pill('Expired')?.click();
    await afterNavigation();
    const request = httpMock.expectOne((candidate) => candidate.url === LIST_URL);

    expect(TestBed.inject(Router).url).toBe('/my-tutoring/packages?status=Expired');
    expect(request.request.params.get('status')).toBe('Expired');
    expect(request.request.params.get('page')).toBe('1');
    request.flush(paged([]));
  });

  it('says there are no packages yet and points to the tutors', async () => {
    await open('/my-tutoring/packages', paged([]));

    expect(textOf(root())).toContain('No packages yet');
    expect(root().querySelector('a[href="/tutors"]')).not.toBeNull();
  });

  it('says nothing has this status and offers to show all', async () => {
    await open('/my-tutoring/packages?status=Cancelled', paged([]));

    expect(textOf(root())).toContain('No packages with this status');
    buttonByText(root(), 'Show all')?.click();
    await afterNavigation();
    const request = httpMock.expectOne((candidate) => candidate.url === LIST_URL);
    expect(request.request.params.has('status')).toBe(false);
    request.flush(paged([]));
  });

  it('shows an error with a retry, and recovers', async () => {
    await open('/my-tutoring/packages', { status: 500 });

    expect(textOf(root())).toContain('Could not load your packages');
    buttonByText(root(), 'Try again')?.click();
    await settle(harness.fixture);
    httpMock.expectOne((candidate) => candidate.url === LIST_URL).flush(paged([activePurchase()]));
    await settle(harness.fixture);

    expect(root().querySelectorAll('app-package-card')).toHaveLength(1);
  });

  it('pages: more than one page shows the pagination and moves through ?page=', async () => {
    await open('/my-tutoring/packages', paged([activePurchase()], { totalPages: 3, totalCount: 25 }));

    expect(root().querySelector('app-pagination')).not.toBeNull();
    (Array.from(root().querySelectorAll('app-pagination button')).find((candidate) => candidate.textContent?.trim() === '2') as HTMLButtonElement).click();
    await afterNavigation();
    const request = httpMock.expectOne((candidate) => candidate.url === LIST_URL);

    expect(request.request.params.get('page')).toBe('2');
    request.flush(paged([activePurchase()], { page: 2, totalPages: 3, totalCount: 25 }));
  });

  it('is never indexed and links back to the lessons', async () => {
    await open('/my-tutoring/packages', paged([]));

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(root().querySelector('a[href="/my-tutoring"]')).not.toBeNull();
  });
});
