import { Component } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import type { LearnerProfile } from '../../data/tutoring-learner.models';
import type { PackageOffer } from '../../data/tutoring-packages.models';
import { packageOffer, packagePurchase } from '../../testing/package-fixtures';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { learnerProfile, pagedOf, publicTutor } from '../testing/learner-fixtures';
import { PackagePurchasePage } from './package-purchase-page';

@Component({ selector: 'app-stub', template: '' })
class Stub {}

const TUTOR_URL = '/api/tutoring/tutors/nina-tutor';
const PACKAGES_URL = '/api/tutoring/tutors/nina-tutor/packages';
const PROFILES_URL = '/api/tutoring/learner-profiles';
const PURCHASE_URL = '/api/tutoring/packages/pkg-1/purchase';
const PAGE_URL = '/tutors/nina-tutor/packages/pkg-1';

describe('PackagePurchasePage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'tutors/:slug/packages/:packageId', component: PackagePurchasePage },
          { path: 'tutoring/checkout/package/:purchaseId', component: Stub },
          { path: 'tutors/:slug', component: Stub },
          { path: 'tutors', component: Stub },
          { path: 'my-tutoring/packages', component: Stub },
        ]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => root().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string): HTMLButtonElement | null =>
    Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes(label))?.querySelector('button') ?? null;

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.tick();
    await Promise.resolve();
    harness.detectChanges();
    TestBed.tick();
    await Promise.resolve();
    harness.detectChanges();
  }

  /** Opens the page and answers the three reads it starts with. */
  async function open(options: { offers?: readonly PackageOffer[] | { status: number }; profiles?: readonly LearnerProfile[]; tutor?: { status: number } } = {}): Promise<void> {
    await harness.navigateByUrl(PAGE_URL, PackagePurchasePage);
    await settle();
    const tutorRequest = httpMock.expectOne(TUTOR_URL);
    if (options.tutor) {
      tutorRequest.flush({ title: 'x', reason: 'tutoring.tutor_not_found' }, { status: options.tutor.status, statusText: 'x' });
    } else {
      tutorRequest.flush(publicTutor());
    }
    const offersRequest = httpMock.expectOne(PACKAGES_URL);
    const offers = options.offers ?? [packageOffer()];
    if ('status' in offers) {
      offersRequest.flush({ title: 'x' }, { status: offers.status, statusText: 'x' });
    } else {
      offersRequest.flush(offers);
    }
    await settle();
    const profileRequests = httpMock.match((request) => request.url === PROFILES_URL);
    for (const request of profileRequests) {
      request.flush(pagedOf(options.profiles ?? [learnerProfile()]));
    }
    await settle();
    await settle();
  }

  it('shows exactly what is sold, with every figure as the server priced it', async () => {
    await open();

    expect(root().querySelector('h1')?.textContent?.trim()).toBe('Buy a lesson package from Nina Tutor');
    expect(text()).toContain('Physics');
    expect(text()).toContain('10 lessons of 60 minutes');
    expect(text()).toContain('One-on-one lessons');
    expect(text()).toContain('Valid for 90 days after you pay');
    expect(text()).toMatch(/Price of one lesson\s*฿450\.00/);
    expect(text()).toMatch(/Package discount \(10%\)\s*saves ฿450\.00/);
    expect(text()).toMatch(/Per lesson in this package\s*฿405\.00/);
    expect(text()).toMatch(/Total\s*฿4,050\.00/);
  });

  it('says before the person commits that unused lessons are not refunded after the expiry date, with the exact number of days', async () => {
    await open();

    expect(text()).toContain('Your lessons expire 90 days after payment. Lessons you have not used by then are not refunded');
  });

  it('leaves out the discount line for a package without a discount', async () => {
    await open({ offers: [packageOffer({ discountPercent: 0, savingsAmount: 0, totalPrice: 4500, pricePerSession: 450 })] });

    expect(text()).not.toContain('Package discount');
    expect(text()).toMatch(/Total\s*฿4,500\.00/);
  });

  it('picks the only learner there is and continues to the payment with just the package and the learner', async () => {
    await open();

    expect(button('Continue to payment')?.disabled).toBe(false);
    button('Continue to payment')?.click();
    await settle();
    const request = httpMock.expectOne(PURCHASE_URL);
    expect(request.request.body).toEqual({ learnerProfileId: 'lp-1' });
    request.flush(packagePurchase(), { status: 201, statusText: 'Created' });
    await settle();
    await settle();

    await vi.waitFor(() => expect(router.url).toBe('/tutoring/checkout/package/pp-1'));
  });

  it('needs a learner before it lets the person continue, and asks for one', async () => {
    await open({ profiles: [learnerProfile(), learnerProfile({ learnerProfileId: 'lp-2', nickname: 'Fah' })] });

    expect(button('Continue to payment')?.disabled).toBe(true);
    expect(text()).toContain('Choose who the lessons are for to continue.');
  });

  it('guards against a double click: one purchase is started', async () => {
    await open();

    button('Continue to payment')?.click();
    await settle();
    button('Continue to payment')?.click();
    await settle();

    expect(httpMock.match(PURCHASE_URL)).toHaveLength(1);
  });

  it('explains a refusal in words and stays on the page; too many unpaid purchases offers the way to finish them', async () => {
    await open();

    button('Continue to payment')?.click();
    await settle();
    httpMock
      .expectOne(PURCHASE_URL)
      .flush({ title: 'x', errorCode: 'conflict', reason: 'tutoring.too_many_pending_purchases' }, { status: 409, statusText: 'Conflict' });
    await settle();
    await settle();

    expect(root().querySelector('[role="alert"]')?.textContent).toContain('several package purchases waiting for payment');
    expect(router.url).toBe(PAGE_URL);
    // The button is usable again after a refusal.
    expect(button('Continue to payment')?.disabled).toBe(false);

    const finish = Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes('See my unpaid packages'));
    expect(finish).toBeDefined();
    (finish as HTMLElement).click();
    await vi.waitFor(() => expect(router.url).toBe('/my-tutoring/packages?status=PendingPayment'));
  });

  it('reads the packages again when the server says this one is not on sale any more', async () => {
    await open();

    button('Continue to payment')?.click();
    await settle();
    httpMock.expectOne(PURCHASE_URL).flush({ title: 'x', errorCode: 'not_found', reason: 'tutoring.package_not_found' }, { status: 404, statusText: 'Not Found' });
    await settle();
    httpMock.expectOne(PACKAGES_URL).flush([]);
    await settle();
    await settle();

    expect(text()).toContain('This package is not available');
  });

  it('reads the packages again when the server says the package offering is inactive (400)', async () => {
    await open();

    button('Continue to payment')?.click();
    await settle();
    httpMock
      .expectOne(PURCHASE_URL)
      .flush({ title: 'x', errorCode: 'bad_request', reason: 'tutoring.package_offering_inactive' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    httpMock.expectOne(PACKAGES_URL).flush([]);
    await settle();
    await settle();

    expect(text()).toContain('This package is not available');
  });

  it('says a package that is not on the tutor\'s list is not available - the same for every cause - and points back to the tutor', async () => {
    await open({ offers: [packageOffer({ packageId: 'other' })] });

    expect(root().querySelector('h2')?.textContent).toContain('This package is not available');
    expect(button('Continue to payment')).toBeNull();
    expect(root().querySelector('a[href="/tutors/nina-tutor"]')).not.toBeNull();
  });

  it('says the tutor is not available for a slug that is not public', async () => {
    await harness.navigateByUrl(PAGE_URL, PackagePurchasePage);
    await settle();
    httpMock.expectOne(TUTOR_URL).flush({ title: 'x', reason: 'tutoring.tutor_not_found' }, { status: 404, statusText: 'x' });
    httpMock.expectOne(PACKAGES_URL).flush({ title: 'x', reason: 'tutoring.tutor_not_found' }, { status: 404, statusText: 'x' });
    await settle();
    await settle();

    expect(root().querySelector('h1')?.textContent).toContain('This tutor is not available');
    expect(button('Continue to payment')).toBeNull();
  });

  it('shows an error with a retry when the packages cannot be read, and recovers', async () => {
    await open({ offers: { status: 500 } });

    expect(root().querySelector('[role="alert"]')?.textContent).toContain('Could not load the package');
    button('Try again')?.click();
    await settle();
    httpMock.expectOne(TUTOR_URL).flush(publicTutor());
    httpMock.expectOne(PACKAGES_URL).flush([packageOffer()]);
    await settle();
    await settle();
    for (const request of httpMock.match((r) => r.url === PROFILES_URL)) {
      request.flush(pagedOf([learnerProfile()]));
    }
    await settle();

    expect(text()).toMatch(/Total\s*฿4,050\.00/);
  });

  it('is never indexed', async () => {
    await open();

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });
});
