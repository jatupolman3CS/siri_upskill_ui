import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { pagedOf, tutorOffering, tutorProfile } from '../testing/tutor-fixtures';
import { type Route, settleWith, tutorPackage } from '../testing/tutor-ops-fixtures';
import { TutorPackagesPage } from './tutor-packages-page';

registerLocaleData(localeTh);

const PACKAGES_URL = '/api/tutoring/tutor/packages';

describe('TutorPackagesPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring/packages', component: TutorPackagesPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';
  const buttons = (): HTMLButtonElement[] => [...page().querySelectorAll('button')];
  const button = (label: string): HTMLButtonElement => buttons().find((b) => b.textContent?.trim() === label)!;
  const buttonStarting = (label: string): HTMLButtonElement => buttons().find((b) => b.textContent?.trim().startsWith(label))!;

  function routes(packages: readonly unknown[], overrides: readonly Route[] = []): readonly Route[] {
    return [
      ...overrides,
      { url: PACKAGES_URL, method: 'GET', reply: pagedOf(packages) },
      { url: '/api/tutoring/tutor/offerings', reply: pagedOf([tutorOffering(), tutorOffering({ offeringId: 'off-2', isActive: false })]) },
      { url: '/api/tutoring/tutor/profile', reply: tutorProfile() },
    ];
  }

  async function open(packages: readonly unknown[] = [tutorPackage()], overrides: readonly Route[] = []) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/packages', TutorPackagesPage);
    return settleWith(harness, httpMock, routes(packages, overrides));
  }

  const settle = (packages: readonly unknown[] = [tutorPackage()], overrides: readonly Route[] = []) => settleWith(harness, httpMock, routes(packages, overrides));

  async function type(selector: string, value: string, packages: readonly unknown[] = [tutorPackage()]): Promise<void> {
    const element = page().querySelector<HTMLInputElement>(selector)!;
    element.value = value;
    element.dispatchEvent(new Event('input'));
    await settle(packages);
  }

  it('shows each package with the price the server computed - the page adds and multiplies nothing', async () => {
    await open([tutorPackage(), tutorPackage({ packageId: 'p-2', sessionCount: 5, durationMinutes: 90, discountPercent: 0, totalPrice: 3375, pricePerSession: 675, savingsAmount: 0, isActive: false })]);
    expect(text()).toContain('10 lessons × 60 min');
    expect(text()).toContain('4,050.00');
    expect(text()).toContain('405.00');
    expect(text()).toContain('10% (saves');
    expect(text()).toContain('90 days');
    expect(text()).toContain('5 lessons × 90 min');
    expect(text()).toContain('3,375.00');
    expect(text()).toContain('On sale');
    expect(text()).toContain('Off sale');
  });

  it('offers only active subjects and explains that sold credits survive a deactivation', async () => {
    await open();
    button('Create a package').click();
    await settle();
    const options = [...page().querySelectorAll<HTMLOptionElement>('app-tutor-package-form select option')].map((o) => o.textContent?.trim());
    expect(options.filter((label) => label?.includes('Physics'))).toHaveLength(1);
    expect(text()).toContain('Stopping sales does not affect credits already sold');
  });

  it('checks the form before sending anything, then creates with only inputs - never a price', async () => {
    await open([]);
    button('Create a package').click();
    await settle([]);
    await type('app-tutor-package-form input[type=number]', '1', []);
    buttons().find((b) => b.textContent?.trim() === 'Create package' && b.type === 'submit')!.click();
    await settle([]);
    expect(text()).toContain('Enter a number from 2 to 30.');

    await type('app-tutor-package-form input[type=number]', '8', []);
    buttons().find((b) => b.textContent?.trim() === 'Create package' && b.type === 'submit')!.click();
    const seen = await settle([], [{ url: PACKAGES_URL, method: 'POST', status: 201, reply: tutorPackage({ sessionCount: 8 }) }]);
    const post = seen.find((request) => request.request.method === 'POST')!;
    expect(post.request.body).toEqual({ offeringId: 'off-1', sessionCount: 8, durationMinutes: 60, discountPercent: 10, validDays: 90, isActive: true });
  });

  it('locks what identifies a package when editing and resends it unchanged with the new discount', async () => {
    await open();
    buttonStarting('Edit').click();
    await settle();
    const inputs = page().querySelectorAll<HTMLInputElement>('app-tutor-package-form input[type=number]');
    expect(inputs[0].disabled).toBe(true); // number of lessons
    expect(page().querySelector<HTMLSelectElement>('app-tutor-package-form select')!.disabled).toBe(true);
    expect(text()).toContain('cannot be changed once created');

    await type('app-tutor-package-form input[inputmode=decimal]', '15');
    buttons().find((b) => b.textContent?.trim() === 'Save changes')!.click();
    const seen = await settle([tutorPackage()], [{ url: `${PACKAGES_URL}/p-1`, method: 'PUT', reply: tutorPackage({ discountPercent: 15 }) }]);
    expect(seen.find((request) => request.request.method === 'PUT')!.request.body).toEqual({
      offeringId: 'off-1',
      sessionCount: 10,
      durationMinutes: 60,
      discountPercent: 15,
      validDays: 90,
      isActive: true,
    });
  });

  it('shows the server\'s reason when a package already exists with that shape', async () => {
    await open([]);
    button('Create a package').click();
    await settle([]);
    buttons().find((b) => b.textContent?.trim() === 'Create package' && b.type === 'submit')!.click();
    await settle(
      [],
      [{ url: PACKAGES_URL, method: 'POST', status: 409, reply: { status: 409, errorCode: 'conflict', reason: 'tutoring.package_duplicate_shape' } }],
    );
    expect(text()).toContain('You already sell a package with the same subject');
  });

  it('takes a package off sale with POST /deactivate and puts it back with the same values', async () => {
    await open();
    buttonStarting('Stop selling').click();
    const inactive = tutorPackage({ isActive: false });
    // After the POST the page reads the list again; the server now answers the package as off sale.
    const off = await settle([inactive], [{ url: `${PACKAGES_URL}/p-1/deactivate`, method: 'POST', reply: {} }]);
    expect(off.some((request) => request.request.url === `${PACKAGES_URL}/p-1/deactivate`)).toBe(true);
    expect(text()).toContain('Off sale');
    buttonStarting('Sell again').click();
    const on = await settle([inactive], [{ url: `${PACKAGES_URL}/p-1`, method: 'PUT', reply: tutorPackage() }]);
    expect(on.find((request) => request.request.method === 'PUT')!.request.body).toMatchObject({ sessionCount: 10, isActive: true });
  });

  it('explains that a subject is needed first when none is active', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/packages', TutorPackagesPage);
    await settleWith(harness, httpMock, [
      { url: PACKAGES_URL, method: 'GET', reply: pagedOf([]) },
      { url: '/api/tutoring/tutor/offerings', reply: pagedOf([tutorOffering({ isActive: false })]) },
      { url: '/api/tutoring/tutor/profile', reply: tutorProfile() },
    ]);
    expect(text()).toContain('You need at least one active subject');
    expect(buttons().some((b) => b.textContent?.trim() === 'Create a package')).toBe(false);
  });

  it('shows the empty state', async () => {
    await open([]);
    expect(text()).toContain('No packages yet');
  });

  it('shows an error state with a retry', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/packages', TutorPackagesPage);
    await settleWith(harness, httpMock, [
      { url: PACKAGES_URL, method: 'GET', status: 500, reply: { status: 500 } },
      { url: '/api/tutoring/tutor/offerings', reply: pagedOf([tutorOffering()]) },
      { url: '/api/tutoring/tutor/profile', reply: tutorProfile() },
    ]);
    expect(text()).toContain('Could not load your packages');
    expect(buttons().some((b) => b.textContent?.trim() === 'Try again')).toBe(true);
  });
});
