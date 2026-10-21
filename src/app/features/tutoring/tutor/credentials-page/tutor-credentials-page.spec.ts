import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeTh from '@angular/common/locales/th';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import type { TutorCertificate, TutorEducation } from '../../data/tutoring-tutor.models';
import { pagedOf } from '../testing/tutor-fixtures';
import { TutorCredentialsPage } from './tutor-credentials-page';

registerLocaleData(localeTh);

const EDU_URL = '/api/tutoring/tutor/educations';
const CERT_URL = '/api/tutoring/tutor/certificates';
const LIST_QUERY = '?page=1&pageSize=100';

const EDUCATION: TutorEducation = { educationId: 'e1', institution: 'Chulalongkorn University', degree: 'B.Sc.', field: 'Physics', yearFrom: 2012, yearTo: 2016, sortOrder: 0 };
const CERTIFICATE: TutorCertificate = { certificateId: 'c1', title: 'Teaching licence', issuer: 'Teachers Council', year: 2018, sortOrder: 0 };

describe('TutorCredentialsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'instructor/tutoring/credentials', component: TutorCredentialsPage }]),
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

  async function open(educations: readonly TutorEducation[], certificates: readonly TutorCertificate[]): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/credentials', TutorCredentialsPage);
    httpMock.expectOne(EDU_URL + LIST_QUERY).flush(pagedOf(educations));
    httpMock.expectOne(CERT_URL + LIST_QUERY).flush(pagedOf(certificates));
    await settle();
  }

  const page = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const text = (): string => page().textContent ?? '';
  const button = (label: string, root: ParentNode = page()): HTMLButtonElement | undefined =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

  async function type(root: ParentNode, selector: string, value: string): Promise<void> {
    const element = root.querySelector<HTMLInputElement>(selector)!;
    element.value = value;
    element.dispatchEvent(new Event('input'));
    await settle();
  }

  const education = (): HTMLElement => page().querySelector<HTMLElement>('app-tutor-education-section')!;
  const certificates = (): HTMLElement => page().querySelector<HTMLElement>('app-tutor-certificate-section')!;

  it('lists education and certificates, and says when a list is empty', async () => {
    await open([EDUCATION], []);
    expect(text()).toContain('B.Sc. · Physics');
    expect(text()).toContain('Chulalongkorn University');
    expect(text()).toContain('2012 - 2016');
    expect(text()).toContain('No certificates added yet');
  });

  it('shows "present" for a study that is still running', async () => {
    await open([{ ...EDUCATION, yearTo: null }], []);
    expect(text()).toContain('2012 - present');
  });

  it('blocks an incomplete education before any request and marks the fields', async () => {
    await open([], []);
    button('Add education', education())!.click();
    await settle();
    education().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();

    httpMock.expectNone(EDU_URL);
    expect(education().querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThanOrEqual(3);
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
  });

  it('adds an education at the end of the list and reloads', async () => {
    await open([EDUCATION], []);
    button('Add education', education())!.click();
    await settle();
    await type(education(), 'app-input[formcontrolname="institution"] input', 'Mahidol University');
    await type(education(), 'app-input[formcontrolname="degree"] input', 'M.Sc.');
    await type(education(), 'app-input[formcontrolname="yearFrom"] input', '2017');
    education().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();

    const req = httpMock.expectOne(EDU_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ institution: 'Mahidol University', degree: 'M.Sc.', field: null, yearFrom: 2017, yearTo: null, sortOrder: 1 });
    req.flush({ ...EDUCATION, educationId: 'e2' }, { status: 201, statusText: 'Created' });
    await settle();
    httpMock.expectOne(EDU_URL + LIST_QUERY).flush(pagedOf([EDUCATION, { ...EDUCATION, educationId: 'e2', institution: 'Mahidol University' }]));
    await settle();
    expect(text()).toContain('Mahidol University');
    expect(education().querySelector('form')).toBeNull();
  });

  it('edits an education in place, keeping its position', async () => {
    await open([{ ...EDUCATION, sortOrder: 4 }], []);
    button('Edit', education())!.click();
    await settle();
    expect(education().querySelector<HTMLInputElement>('app-input[formcontrolname="institution"] input')!.value).toBe('Chulalongkorn University');
    await type(education(), 'app-input[formcontrolname="degree"] input', 'B.Eng.');
    education().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();
    const req = httpMock.expectOne(`${EDU_URL}/e1`);
    expect(req.request.method).toBe('PUT');
    expect((req.request.body as { sortOrder: number; degree: string }).sortOrder).toBe(4);
    expect((req.request.body as { degree: string }).degree).toBe('B.Eng.');
    req.flush(EDUCATION);
    await settle();
    httpMock.expectOne(EDU_URL + LIST_QUERY).flush(pagedOf([EDUCATION]));
  });

  it('deletes an education only after the confirmation dialog', async () => {
    await open([EDUCATION], []);
    button('Delete', education())!.click();
    await settle();
    httpMock.expectNone(`${EDU_URL}/e1`);
    expect(document.body.textContent).toContain('Remove this education?');

    [...document.querySelectorAll<HTMLButtonElement>('app-modal button')].find((b) => b.textContent?.trim() === 'Delete')!.click();
    const req = httpMock.expectOne(`${EDU_URL}/e1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    httpMock.expectOne(EDU_URL + LIST_QUERY).flush(pagedOf([]));
    await settle();
    expect(text()).toContain('No education added yet');
  });

  it('adds a certificate with a trimmed optional issuer', async () => {
    await open([], []);
    button('Add certificate', certificates())!.click();
    await settle();
    await type(certificates(), 'app-input[formcontrolname="title"] input', 'IELTS 8.0');
    await type(certificates(), 'app-input[formcontrolname="issuer"] input', '   ');
    await type(certificates(), 'app-input[formcontrolname="year"] input', '2024');
    certificates().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();

    const req = httpMock.expectOne(CERT_URL);
    expect(req.request.body).toEqual({ title: 'IELTS 8.0', issuer: null, year: 2024, sortOrder: 0 });
    req.flush(CERTIFICATE, { status: 201, statusText: 'Created' });
    await settle();
    httpMock.expectOne(CERT_URL + LIST_QUERY).flush(pagedOf([CERTIFICATE]));
  });

  it('explains a server limit without leaving the form', async () => {
    await open([], []);
    button('Add certificate', certificates())!.click();
    await settle();
    await type(certificates(), 'app-input[formcontrolname="title"] input', 'Another');
    await type(certificates(), 'app-input[formcontrolname="year"] input', '2024');
    certificates().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();
    httpMock.expectOne(CERT_URL).flush({ reason: 'tutoring.certificate_limit' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(certificates().querySelector('app-tutor-problem')?.textContent).toContain('maximum number of certificates');
    expect(certificates().querySelector('form')).not.toBeNull();
  });

  it('keeps one section usable when the other fails to load', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/instructor/tutoring/credentials', TutorCredentialsPage);
    httpMock.expectOne(EDU_URL + LIST_QUERY).flush({}, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(CERT_URL + LIST_QUERY).flush(pagedOf([CERTIFICATE]));
    await settle();
    expect(text()).toContain('We could not load your education');
    expect(text()).toContain('Teaching licence');
  });
});
