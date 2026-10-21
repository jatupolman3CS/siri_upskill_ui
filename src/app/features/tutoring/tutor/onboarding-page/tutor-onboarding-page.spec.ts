import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { ToastService } from '../../../../shared/toast/toast.service';
import type { TutorStatus } from '../../data/tutoring-tutor.models';
import { kycCase, kycStatus, tutorProfile } from '../testing/tutor-fixtures';
import { TutorOnboardingPage } from './tutor-onboarding-page';

registerLocaleData(localeTh);

const PROFILE_URL = '/api/tutoring/tutor/profile';
const KYC_URL = '/api/tutoring/tutor/kyc';

describe('TutorOnboardingPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring', component: TutorOnboardingPage }]),
        // withFetch() + the real error interceptor: same transport and error shape as app.config.ts.
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    for (let pass = 0; pass < 3; pass++) {
      harness.detectChanges();
      TestBed.flushEffects();
      await Promise.resolve();
    }
    harness.detectChanges();
  }

  async function open(url = '/instructor/tutoring'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, TutorOnboardingPage);
    await settle();
  }

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';
  /** The call-to-action inside the "next step" card (the section switcher at the top links to the same routes). */
  const nextAction = (href: string): HTMLAnchorElement | null =>
    page().querySelector<HTMLAnchorElement>(`section[aria-labelledby="hub-next-heading"] a[href="${href}"]`);

  async function profileIs(status: TutorStatus, extra: Parameters<typeof tutorProfile>[0] = {}): Promise<void> {
    httpMock.expectOne(PROFILE_URL).flush(tutorProfile({ status, ...extra }));
    await settle();
  }

  it('sets a noindex title for the studio page', async () => {
    await open();
    httpMock.expectOne(PROFILE_URL).flush({ reason: 'tutoring.tutor_profile_not_found' }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(TestBed.inject(Title).getTitle()).toContain('Tutoring overview');
  });

  it('shows a skeleton with an accessible name while loading', async () => {
    await open();
    expect(page().querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Loading your tutor profile');
    httpMock.expectOne(PROFILE_URL).flush(tutorProfile());
    await settle();
    httpMock.expectOne(KYC_URL).flush(kycStatus());
  });

  it('treats "no profile yet" as the start of onboarding, not as an error, and does not ask for verification status', async () => {
    await open();
    httpMock.expectOne(PROFILE_URL).flush({ reason: 'tutoring.tutor_profile_not_found' }, { status: 404, statusText: 'Not Found' });
    await settle();
    httpMock.expectNone(KYC_URL);
    expect(text()).toContain('Create your tutor profile');
    expect(nextAction('/instructor/tutoring/profile')?.textContent).toContain('Create profile');
    expect(text()).not.toContain('We could not load');
  });

  it('lists what a draft profile still lacks, each linking to the screen that fixes it', async () => {
    await open();
    await profileIs('Draft', { readiness: { canSubmitForVerification: false, blockers: ['bio_too_short', 'no_active_offering', 'kyc_case_missing'] } });
    httpMock.expectOne(KYC_URL).flush(kycStatus());
    await settle();

    expect(text()).toContain('Complete your profile');
    const links = [...page().querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/instructor/tutoring/offerings');
    expect(links).toContain('/instructor/tutoring/profile');
    // The kyc_* blocker is the verification page's business, not a profile fix.
    expect(text()).not.toContain('Start the identity verification request');
  });

  it('sends a complete draft on to identity verification', async () => {
    await open();
    await profileIs('Draft');
    httpMock.expectOne(KYC_URL).flush(kycStatus());
    await settle();
    expect(text()).toContain('Verify your identity');
    expect(nextAction('/instructor/tutoring/kyc')?.textContent).toContain('Start verification');
  });

  it('says so when identity verification is switched off, instead of an error', async () => {
    await open();
    await profileIs('Draft');
    httpMock.expectOne(KYC_URL).flush({ reason: 'tutoring.kyc.disabled' }, { status: 503, statusText: 'Service Unavailable' });
    await settle();
    expect(text()).toContain('Verification is not available yet');
    expect(text()).not.toContain('could not load your verification status');
  });

  it('shows the reviewers\' message to a tutor who has to provide more information', async () => {
    await open();
    await profileIs('NeedsInfo');
    httpMock.expectOne(KYC_URL).flush(kycStatus({ currentCase: kycCase({ status: 'NeedsInfo', decisionNote: 'Please re-upload a sharper copy of your ID.' }) }));
    await settle();
    expect(text()).toContain('We need more information');
    expect(text()).toContain('Please re-upload a sharper copy of your ID.');
    expect(nextAction('/instructor/tutoring/kyc')).not.toBeNull();
  });

  it('explains a suspension with its reason and offers no action', async () => {
    await open();
    await profileIs('Suspended', { statusReason: 'Repeated no-shows' });
    httpMock.expectNone(KYC_URL);
    expect(text()).toContain('Your tutor account is suspended');
    expect(text()).toContain('Repeated no-shows');
    expect(nextAction('/instructor/tutoring/kyc')).toBeNull();
  });

  it('lets a verified tutor open the listing with the latest row version, and reflects the answer', async () => {
    await open();
    await profileIs('Verified', { verifiedAtUtc: '2026-10-01T03:00:00Z' });
    httpMock.expectNone(KYC_URL);
    const toast = TestBed.inject(ToastService);
    const success = vi.spyOn(toast, 'success');

    const open_ = [...page().querySelectorAll('button')].find((b) => b.textContent?.includes('Open my listing'))!;
    open_.click();
    const req = httpMock.expectOne(`${PROFILE_URL}/listing`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ isListed: true, rowVersion: 'AAAAAAAAB9E=' });
    req.flush(tutorProfile({ status: 'Verified', isListed: true, rowVersion: 'AAAAAAAAB9F=', slug: 'nina-tutor' }));
    await settle();

    expect(success).toHaveBeenCalled();
    expect(text()).toContain('Pause my listing');
    expect(page().querySelector('a[href="/tutors/nina-tutor"]')).not.toBeNull();
  });

  it('explains why a listing could not be opened', async () => {
    await open();
    await profileIs('Verified');
    [...page().querySelectorAll('button')].find((b) => b.textContent?.includes('Open my listing'))!.click();
    httpMock.expectOne(`${PROFILE_URL}/listing`).flush({ reason: 'tutoring.no_active_offering' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('Add at least one active subject offering first.');
  });

  it('shows the explanation behind a redirect from a verified-only screen', async () => {
    await open('/instructor/tutoring?required=verified');
    await profileIs('Draft');
    httpMock.expectOne(KYC_URL).flush(kycStatus());
    await settle();
    expect(text()).toContain('only for verified tutors');
  });

  it('offers a retry when the profile cannot be loaded', async () => {
    await open();
    httpMock.expectOne(PROFILE_URL).flush({}, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(text()).toContain('We could not load your tutor profile');

    [...page().querySelectorAll('button')].find((b) => b.textContent?.includes('Try again'))!.click();
    await settle();
    httpMock.expectOne(PROFILE_URL).flush(tutorProfile({ status: 'PendingVerification' }));
    await settle();
    expect(text()).toContain('Your request is being reviewed');
  });
});
