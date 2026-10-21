import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import type { PackageOffer } from '../../../data/tutoring-packages.models';
import type { PackagePurchaseDetail } from '../../../data/tutoring-package-purchase.models';
import { packageDetail, packageOffer, packagePurchase } from '../../../testing/package-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { confirmedBooking, slotsResponse } from '../../testing/learner-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { PackageDetailPage } from './package-detail-page';

@Component({ template: '' })
class RouteStub {}

const PURCHASE_URL = '/api/tutoring/package-purchases/pp-1';
const OFFERS_URL = '/api/tutoring/tutors/nina-tutor/packages';
const PAGE_URL = '/my-tutoring/packages/pp-1';

describe('PackageDetailPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'my-tutoring/packages/:purchaseId', component: PackageDetailPage },
          { path: 'my-tutoring/packages', component: RouteStub },
          { path: 'my-tutoring/bookings/:bookingId', component: RouteStub },
          { path: 'tutoring/checkout/package/:purchaseId', component: RouteStub },
        ]),
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const slotRequests = () => httpMock.match((request) => request.url.endsWith('/slots'));

  async function open(answer: PackagePurchaseDetail | { status: number }, offers: readonly PackageOffer[] | 'fail' = [packageOffer()]): Promise<void> {
    await harness.navigateByUrl(PAGE_URL, PackageDetailPage);
    await settle(harness.fixture);
    const request = httpMock.expectOne(PURCHASE_URL);
    if ('purchaseId' in answer) {
      request.flush(answer);
    } else {
      request.flush({ title: 'x', reason: 'tutoring.package_purchase_not_found' }, { status: answer.status, statusText: 'x' });
    }
    await settle(harness.fixture);
    const wanted = httpMock.match((candidate) => candidate.url === OFFERS_URL);
    for (const offersRequest of wanted) {
      if (offers === 'fail') {
        offersRequest.flush({ title: 'x' }, { status: 500, statusText: 'x' });
      } else {
        offersRequest.flush(offers);
      }
    }
    await settle(harness.fixture);
    await settle(harness.fixture);
  }

  it('shows a busy skeleton while the purchase loads', async () => {
    await harness.navigateByUrl(PAGE_URL, PackageDetailPage);
    await settle(harness.fixture);

    expect(root().querySelector('[role="status"][aria-label="Loading the package"]')).not.toBeNull();
    httpMock.expectOne(PURCHASE_URL).flush(packageDetail({ status: 'Exhausted', creditsRemaining: 0 }));
  });

  it('shows the package in full: credits left, lesson length, expiry in Bangkok time, price, and the no-refund rule', async () => {
    await open(packageDetail({ status: 'Exhausted', creditsRemaining: 0, sessionsUsed: 10 }));

    const text = textOf(root());
    expect(root().querySelector('h1')?.textContent?.trim()).toBe('10 lessons of 60 minutes');
    expect(text).toContain('With Nina Tutor, for Mint');
    expect(text).toContain('All lessons booked');
    expect(text).toMatch(/Lessons left\s*0 of 10/);
    expect(text).toContain('60 minutes per lesson');
    expect(text).toContain('12 Jan 2027 10:05');
    expect(text).toContain('฿4,050.00');
    expect(text).toContain('Lessons you have not used by the expiry date are not refunded');
  });

  it('lists every credit with its status and the lesson that holds it', async () => {
    await open(packageDetail({ status: 'Exhausted', creditsRemaining: 0 }));

    const rows = Array.from(root().querySelectorAll('app-package-credit-list li'));
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('Booked');
    expect(rows[1].querySelector('a')?.getAttribute('href')).toBe('/my-tutoring/bookings/b-2');
  });

  it('offers the calendar for a package with credits left, for the subject found in the tutor\'s package list', async () => {
    await open(packageDetail());

    expect(textOf(root())).toContain('Book a lesson with a credit');
    expect(root().querySelector('app-package-credit-booking')).not.toBeNull();
    const [request] = slotRequests();
    expect(request.request.params.get('offeringId')).toBe('off-physics');
    request.flush(slotsResponse([]));
  });

  it('offers no calendar when every lesson is booked', async () => {
    await open(packageDetail({ status: 'Exhausted', creditsRemaining: 0 }));

    expect(root().querySelector('app-package-credit-booking')).toBeNull();
    httpMock.expectNone(OFFERS_URL);
  });

  it('offers no calendar for a package that ran out of time but is not yet closed, and says it is being reviewed', async () => {
    await open(packageDetail({ expiredPendingSettlement: true }));

    expect(root().querySelector('app-package-credit-booking')).toBeNull();
    expect(textOf(root())).toContain('being reviewed by our team');
  });

  it('says it cannot show times when the tutor no longer sells this package, without suggesting the lessons are lost', async () => {
    await open(packageDetail(), []);

    expect(root().querySelector('app-package-credit-booking')).toBeNull();
    expect(textOf(root())).toContain('We cannot show times for this package right now. Your lessons are safe');
  });

  it('says the same when the tutor\'s package list cannot be read, and reads it again on retry', async () => {
    await open(packageDetail(), 'fail');

    expect(textOf(root())).toContain('We cannot show times for this package right now');
    buttonByText(root(), 'Try again')?.click();
    await settle(harness.fixture);
    httpMock.expectOne(OFFERS_URL).flush([packageOffer()]);
    await settle(harness.fixture);
    await settle(harness.fixture);

    expect(root().querySelector('app-package-credit-booking')).not.toBeNull();
    slotRequests().forEach((request) => request.flush(slotsResponse([])));
  });

  it('reads the purchase again after a lesson was booked with a credit, so the counts and the credit list are the server\'s', async () => {
    await open(packageDetail());
    const [slots] = slotRequests();
    slots.flush(slotsResponse(['2026-10-20T11:00:00Z']));
    await settle(harness.fixture);
    await settle(harness.fixture);
    (root().querySelector('[role="tabpanel"] ul button') as HTMLButtonElement).click();
    await settle(harness.fixture);

    buttonByText(root(), 'Book with 1 credit')?.click();
    await settle(harness.fixture);
    httpMock.expectOne('/api/tutoring/package-purchases/pp-1/bookings').flush(confirmedBooking({ bookingId: 'b-9', packagePurchaseId: 'pp-1' }), { status: 201, statusText: 'Created' });
    await settle(harness.fixture);

    // While the purchase is read again the calendar and its "booked" message stay where they are.
    expect(root().querySelector('app-package-credit-booking')).not.toBeNull();
    expect(textOf(root())).toContain('Your lesson is booked.');
    httpMock.expectOne(PURCHASE_URL).flush(packageDetail({ creditsRemaining: 6, sessionsUsed: 4 }));
    await settle(harness.fixture);
    await settle(harness.fixture);
    slotRequests().forEach((request) => request.flush(slotsResponse([])));
    await settle(harness.fixture);

    expect(textOf(root())).toMatch(/Lessons left\s*6 of 10/);
    expect(root().querySelector('app-package-credit-booking')).not.toBeNull();
    expect(textOf(root())).toContain('Your lesson is booked.');
    // The subject lookup is not repeated for the same tutor.
    httpMock.expectNone(OFFERS_URL);
  });

  describe('a purchase that is not paid yet', () => {
    const unpaid = (): PackagePurchaseDetail => ({ ...packagePurchase(), credits: [] });

    it('says so, shows the deadline, and leads to the payment', async () => {
      await open(unpaid());

      const text = textOf(root());
      expect(text).toContain('Waiting for payment');
      expect(text).toContain('This package is not paid for yet.');
      expect(text).toContain('Pay before');
      expect(text).toContain('14 Oct 2026 10:30');
      expect(root().querySelector('app-package-credit-booking')).toBeNull();
      httpMock.expectNone(OFFERS_URL);
      const pay = Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes('Pay now')) as HTMLElement;
      pay.click();
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/tutoring/checkout/package/pp-1'));
    });

    it('asks to confirm before giving the purchase up, and keeps it on "Keep it"', async () => {
      await open(unpaid());

      buttonByText(root(), 'Cancel this purchase')?.click();
      await settle(harness.fixture);
      expect(textOf(root())).toContain('Cancel this unpaid purchase?');
      httpMock.expectNone(`${PURCHASE_URL}/cancel`);

      buttonByText(root(), 'Keep it')?.click();
      await settle(harness.fixture);
      expect(textOf(root())).not.toContain('Cancel this unpaid purchase?');
      httpMock.expectNone(`${PURCHASE_URL}/cancel`);
    });

    it('cancels once even on a double click, then reads the purchase again', async () => {
      await open(unpaid());

      buttonByText(root(), 'Cancel this purchase')?.click();
      await settle(harness.fixture);
      buttonByText(root(), 'Yes, cancel it')?.click();
      await settle(harness.fixture);
      buttonByText(root(), 'Yes, cancel it')?.click();
      await settle(harness.fixture);
      const requests = httpMock.match(`${PURCHASE_URL}/cancel`);
      expect(requests).toHaveLength(1);
      requests[0].flush(null, { status: 204, statusText: 'No Content' });
      await settle(harness.fixture);
      httpMock.expectOne(PURCHASE_URL).flush({ ...packagePurchase({ status: 'Cancelled', pendingExpiresAtUtc: null, requiresPayment: false }), credits: [] });
      await settle(harness.fixture);
      await settle(harness.fixture);

      expect(textOf(root())).toContain('Cancelled');
      expect(buttonByText(root(), 'Pay now')).toBeNull();
    });

    it('explains a refusal to cancel (it was paid meanwhile) and reads the purchase again', async () => {
      await open(unpaid());

      buttonByText(root(), 'Cancel this purchase')?.click();
      await settle(harness.fixture);
      buttonByText(root(), 'Yes, cancel it')?.click();
      await settle(harness.fixture);
      httpMock
        .expectOne(`${PURCHASE_URL}/cancel`)
        .flush({ title: 'x', errorCode: 'conflict', reason: 'tutoring.package_purchase_not_cancellable' }, { status: 409, statusText: 'Conflict' });
      await settle(harness.fixture);
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('can no longer be cancelled');
      httpMock.expectOne(PURCHASE_URL).flush(packageDetail());
      await settle(harness.fixture);
      httpMock.expectOne(OFFERS_URL).flush([packageOffer()]);
      await settle(harness.fixture);
      await settle(harness.fixture);
      slotRequests().forEach((request) => request.flush(slotsResponse([])));
      await settle(harness.fixture);

      expect(textOf(root())).toContain('Active');
      expect(root().querySelector('app-package-credit-booking')).not.toBeNull();
    });
  });

  it('says "not found" for a purchase that is missing or belongs to someone else - the same answer for both', async () => {
    await open({ status: 404 });

    expect(textOf(root())).toContain('Package not found');
    expect(textOf(root())).toContain('does not exist or belongs to another account');
  });

  it('shows an error with a retry, and recovers', async () => {
    await open({ status: 500 });

    expect(textOf(root())).toContain('Could not load the package');
    buttonByText(root(), 'Try again')?.click();
    await settle(harness.fixture);
    httpMock.expectOne(PURCHASE_URL).flush(packageDetail({ status: 'Exhausted', creditsRemaining: 0 }));
    await settle(harness.fixture);

    expect(root().querySelector('h1')?.textContent?.trim()).toBe('10 lessons of 60 minutes');
  });

  it('is never indexed and links back to the list', async () => {
    await open(packageDetail({ status: 'Exhausted', creditsRemaining: 0 }));

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(root().querySelector('a[href="/my-tutoring/packages"]')).not.toBeNull();
  });
});
