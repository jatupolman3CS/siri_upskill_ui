import { registerLocaleData } from '@angular/common';
import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { UPLOAD_HTTP_CLIENT } from '../../../../core/http/upload-http-client';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { TutorKycStatus } from '../../data/tutoring-kyc.models';
import { kycCase, kycDocument, kycStatus } from '../testing/tutor-fixtures';
import { TutorKycPage } from './tutor-kyc-page';

registerLocaleData(localeTh);

const KYC_URL = '/api/tutoring/tutor/kyc';
const ALL_REQUIRED = [
  kycDocument({ documentId: 'd-id', type: 'IdCard' }),
  kycDocument({ documentId: 'd-dip', type: 'Diploma', status: 'Approved' }),
  kycDocument({ documentId: 'd-crim', type: 'CriminalRecord' }),
];

describe('TutorKycPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring/kyc', component: TutorKycPage }]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: UPLOAD_HTTP_CLIENT, useExisting: HttpClient },
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

  async function open(status: TutorKycStatus): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/kyc', TutorKycPage);
    httpMock.expectOne(KYC_URL).flush(status);
    await settle();
  }

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';
  const button = (label: string): HTMLButtonElement | undefined => [...page().querySelectorAll('button')].find((b) => b.textContent?.includes(label));

  describe('availability', () => {
    it('shows a loading state with an accessible name first', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/instructor/tutoring/kyc', TutorKycPage);
      expect(page().querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Loading your verification status');
      httpMock.expectOne(KYC_URL).flush(kycStatus());
    });

    it('says verification is not switched on - for the disabled error and for enabled:false alike', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/instructor/tutoring/kyc', TutorKycPage);
      httpMock.expectOne(KYC_URL).flush({ reason: 'tutoring.kyc.disabled' }, { status: 503, statusText: 'Service Unavailable' });
      await settle();
      expect(text()).toContain('Verification is not available yet');
      expect(button('Try again')).toBeUndefined();
    });

    it('sends someone without a tutor profile to create one first', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/instructor/tutoring/kyc', TutorKycPage);
      httpMock.expectOne(KYC_URL).flush({ reason: 'tutoring.tutor_profile_not_found' }, { status: 404, statusText: 'Not Found' });
      await settle();
      expect(text()).toContain('Create your tutor profile first');
    });

    it('offers a retry on any other failure', async () => {
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/instructor/tutoring/kyc', TutorKycPage);
      httpMock.expectOne(KYC_URL).flush({}, { status: 500, statusText: 'Server Error' });
      await settle();
      expect(text()).toContain('We could not load your verification status');
      button('Try again')!.click();
      await settle();
      httpMock.expectOne(KYC_URL).flush(kycStatus());
      await settle();
      expect(text()).toContain('Step 1: privacy consent');
    });
  });

  describe('consent', () => {
    it('is never pre-ticked, and opening a case needs an explicit tick', async () => {
      await open(kycStatus());
      const checkbox = page().querySelector<HTMLInputElement>('app-checkbox input[type="checkbox"]')!;
      expect(checkbox.checked).toBe(false);
      expect(text()).toContain('Consent to collect and verify identity documents');
      expect(text()).toContain('Consent text version 2026-10-v1');

      const start = button('Accept and continue')!;
      expect(start.disabled).toBe(true);
      start.click();
      httpMock.expectNone(`${KYC_URL}/cases`);

      checkbox.click();
      await settle();
      expect(start.disabled).toBe(false);
    });

    it('sends the version the person was shown, then reloads the status', async () => {
      await open(kycStatus());
      page().querySelector<HTMLInputElement>('app-checkbox input[type="checkbox"]')!.click();
      await settle();
      button('Accept and continue')!.click();

      const req = httpMock.expectOne(`${KYC_URL}/cases`);
      expect(req.request.body).toEqual({ consentVersion: '2026-10-v1' });
      req.flush(kycCase(), { status: 201, statusText: 'Created' });
      await settle();
      httpMock.expectOne(KYC_URL).flush(kycStatus({ currentCase: kycCase() }));
      await settle();
      expect(text()).toContain('Step 2: upload your documents');
    });

    it('refuses to continue when the dictionaries have no text for the announced version', async () => {
      await open(kycStatus({ consentVersion: '2099-01-v9' }));
      expect(text()).toContain('consent text for the current version is not available');
      expect(page().querySelector('app-checkbox')).toBeNull();
      expect(button('Accept and continue')).toBeUndefined();
    });

    it('re-reads the status and asks again when the server says the text has moved on', async () => {
      await open(kycStatus());
      page().querySelector<HTMLInputElement>('app-checkbox input[type="checkbox"]')!.click();
      await settle();
      button('Accept and continue')!.click();
      httpMock
        .expectOne(`${KYC_URL}/cases`)
        .flush({ reason: 'tutoring.kyc.consent_outdated', currentVersion: '2026-11-v2' }, { status: 409, statusText: 'Conflict' });
      await settle();
      httpMock.expectOne(KYC_URL).flush(kycStatus({ consentVersion: '2026-10-v1' }));
      await settle();
      expect(text()).toContain('consent text has been updated');
      expect(page().querySelector<HTMLInputElement>('app-checkbox input[type="checkbox"]')!.checked).toBe(false);
    });
  });

  describe('documents', () => {
    it('lists a slot per required document with an uploader, and shows the privacy notice', async () => {
      await open(kycStatus({ currentCase: kycCase() }));
      expect(text()).toContain('National ID card');
      expect(text()).toContain('Degree or diploma');
      expect(text()).toContain('Criminal-record certificate');
      expect(text()).toContain('cannot be viewed again after you upload it');
      expect(page().querySelectorAll('app-secure-file-uploader')).toHaveLength(5);
      expect(button('Send for review')!.disabled).toBe(true);
      expect(text()).toContain('Still to upload');
    });

    it('shows each document as a status only: no file name, no link, no image, no download', async () => {
      await open(kycStatus({ currentCase: kycCase({ documents: ALL_REQUIRED }) }));
      expect(text()).toContain('Sent on');
      expect(text()).toContain('Approved');
      const slotArea = page().querySelector('app-kyc-documents-step')!;
      expect(slotArea.querySelectorAll('a[href]')).toHaveLength(0);
      expect(slotArea.querySelectorAll('img, iframe, object, embed, video')).toHaveLength(0);
      expect(slotArea.textContent).not.toMatch(/blob:|\.pdf|\.jpe?g|\.png/i);
      expect(slotArea.innerHTML).not.toMatch(/blob:|download=/i);
    });

    it('will not offer to delete an approved document', async () => {
      await open(kycStatus({ currentCase: kycCase({ status: 'NeedsInfo', documents: ALL_REQUIRED }) }));
      const deleteButtons = [...page().querySelectorAll('app-kyc-documents-step li button')].filter((b) => b.textContent?.includes('Delete'));
      // Three documents, one approved: two can be removed.
      expect(deleteButtons).toHaveLength(2);
    });

    it('uploads a file as multipart, then reloads the status', async () => {
      await open(kycStatus({ currentCase: kycCase() }));
      const uploaders = page().querySelectorAll('app-secure-file-uploader');
      const input = uploaders[0].querySelector<HTMLInputElement>('input[type="file"]')!;
      const file = new File([new Uint8Array(64)], 'private-name.pdf', { type: 'application/pdf' });
      Object.defineProperty(input, 'files', { configurable: true, value: { item: () => file, length: 1 } });
      input.dispatchEvent(new Event('change'));
      await settle();

      const req = httpMock.expectOne(`${KYC_URL}/cases/case-1/documents`);
      expect((req.request.body as FormData).get('type')).toBe('IdCard');
      expect(((req.request.body as FormData).get('file') as File).name).toBe('kyc-document.pdf');
      req.flush(kycDocument(), { status: 201, statusText: 'Created' });
      await settle();
      httpMock.expectOne(KYC_URL).flush(kycStatus({ currentCase: kycCase({ documents: [kycDocument()] }) }));
      await settle();
      expect(text()).toContain('Sent on');
      expect(text()).not.toContain('private-name');
    });

    it.each([
      ['size', 'is larger than 10 MB'],
      ['type', 'This file type is not accepted'],
      ['signature', 'do not match its type'],
      ['active_content', 'scripts or other active content'],
    ])('explains a refused upload by the category the server puts in the standard problem `detail` (%s), and never shows server text', async (detail, expected) => {
      await open(kycStatus({ currentCase: kycCase() }));
      const uploader = page().querySelectorAll('app-secure-file-uploader')[0];
      const input = uploader.querySelector<HTMLInputElement>('input[type="file"]')!;
      const file = new File([new Uint8Array(64)], 'private-name.pdf', { type: 'application/pdf' });
      Object.defineProperty(input, 'files', { configurable: true, value: { item: () => file, length: 1 } });
      input.dispatchEvent(new Event('change'));
      await settle();

      httpMock
        .expectOne(`${KYC_URL}/cases/case-1/documents`)
        .flush(
          { status: 400, title: 'SERVER SIDE TITLE', detail, errorCode: 'validation', reason: 'tutoring.kyc.file_rejected' },
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(uploader.textContent).toContain(expected);
      expect(uploader.textContent).not.toContain('SERVER SIDE TITLE');
      expect(uploader.textContent).not.toContain('private-name');
    });

    it('removes a document only after confirmation', async () => {
      await open(kycStatus({ currentCase: kycCase({ documents: [kycDocument()] }) }));
      button('Delete')!.click();
      await settle();
      httpMock.expectNone(`${KYC_URL}/cases/case-1/documents/doc-1`);
      expect(text()).toContain('Delete this document?');

      [...document.querySelectorAll<HTMLButtonElement>('app-modal button')].find((b) => b.textContent?.trim() === 'Delete')!.click();
      const req = httpMock.expectOne(`${KYC_URL}/cases/case-1/documents/doc-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      httpMock.expectOne(KYC_URL).flush(kycStatus({ currentCase: kycCase() }));
    });
  });

  describe('submitting', () => {
    it('stays off until every required type has a document, then sends the case', async () => {
      await open(kycStatus({ currentCase: kycCase({ documents: ALL_REQUIRED }) }));
      const submit = button('Send for review')!;
      expect(submit.disabled).toBe(false);
      submit.click();
      const req = httpMock.expectOne(`${KYC_URL}/cases/case-1/submit`);
      expect(req.request.method).toBe('POST');
      req.flush(kycCase({ status: 'Submitted', documents: ALL_REQUIRED }));
      await settle();
      httpMock.expectOne(KYC_URL).flush(kycStatus({ currentCase: kycCase({ status: 'Submitted', documents: ALL_REQUIRED }) }));
      await settle();
      expect(text()).toContain('being reviewed');
      expect(button('Send for review')).toBeUndefined();
      expect(page().querySelector('input[type="file"]')).toBeNull();
    });

    it('names what the server says is missing', async () => {
      await open(kycStatus({ currentCase: kycCase({ documents: ALL_REQUIRED }) }));
      button('Send for review')!.click();
      httpMock
        .expectOne(`${KYC_URL}/cases/case-1/submit`)
        .flush({ reason: 'tutoring.kyc.documents_missing', missingTypes: ['CriminalRecord'] }, { status: 409, statusText: 'Conflict' });
      await settle();
      expect(page().querySelector('app-tutor-problem')?.textContent).toContain('Some required documents are still missing.');
      expect(page().querySelector('app-tutor-problem')?.textContent).toContain('Criminal-record certificate');
    });

    it('translates the profile blockers the server reports', async () => {
      await open(kycStatus({ currentCase: kycCase({ documents: ALL_REQUIRED }) }));
      button('Send for review')!.click();
      httpMock
        .expectOne(`${KYC_URL}/cases/case-1/submit`)
        .flush({ reason: 'tutoring.kyc.profile_incomplete', blockers: ['bio_too_short', 'brand_new_code'] }, { status: 409, statusText: 'Conflict' });
      await settle();
      const problem = page().querySelector('app-tutor-problem')!.textContent ?? '';
      expect(problem).toContain('Write a longer bio');
      expect(problem).toContain('Something in your profile still needs attention.');
      expect(problem).not.toContain('brand_new_code');
    });
  });

  describe('decisions', () => {
    it('shows the reviewers\' message for a case that needs more information, and lets the tutor edit', async () => {
      await open(kycStatus({ currentCase: kycCase({ status: 'NeedsInfo', decisionNote: 'Your ID photo is blurred.', documents: ALL_REQUIRED }) }));
      expect(text()).toContain('What the review team needs');
      expect(text()).toContain('Your ID photo is blurred.');
      expect(page().querySelectorAll('app-secure-file-uploader').length).toBeGreaterThan(0);
    });

    it('after a rejection shows why and lets the tutor start again when the server allows it', async () => {
      await open(
        kycStatus({
          currentCase: null,
          canStartNewCase: true,
          history: [kycCase({ caseId: 'old', attemptNo: 1, status: 'Rejected', decisionNote: 'Diploma could not be verified.', decidedAtUtc: '2026-10-10T03:00:00Z' })],
        }),
      );
      expect(text()).toContain('Why the last request was not approved');
      expect(text()).toContain('Diploma could not be verified.');
      expect(text()).toContain('Step 1: privacy consent');
      expect(text()).toContain('Earlier requests');
    });

    it('says a new request cannot be started when the server does not allow it', async () => {
      await open(kycStatus({ canStartNewCase: false, history: [kycCase({ status: 'Approved' })] }));
      expect(text()).toContain('No new request can be started');
      expect(page().querySelector('app-checkbox')).toBeNull();
    });
  });
});
