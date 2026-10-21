import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { kycCase } from '../testing/fixtures';
import { HTTP_TEST_PROVIDERS, controlByText, problemBody, settle, textOf, useEnglish } from '../testing/spec-helpers';
import { AdminKycCasePage } from './admin-kyc-case-page';

@Component({ template: '' })
class RouteStub {}

const CASE = '/api/tutoring/admin/kyc/cases/case-1';
const CONTENT = (id: string): string => `/api/tutoring/admin/kyc/documents/${id}/content`;

describe('AdminKycCasePage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;
  let revoked: string[];

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;

  beforeEach(async () => {
    revoked = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (): string => 'blob:case/1' });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: (url: string): void => void revoked.push(url) });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'admin/tutoring/kyc/:caseId', component: AdminKycCasePage }, { path: '**', component: RouteStub }]), ...HTTP_TEST_PROVIDERS],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function open(answer: object | 'pending' | { status: number; body: object }): Promise<void> {
    await harness.navigateByUrl('/admin/tutoring/kyc/case-1', AdminKycCasePage);
    await settle(harness);
    if (answer === 'pending') {
      return;
    }
    const request = httpMock.expectOne(CASE);
    if ('status' in answer && 'body' in answer) {
      request.flush(answer.body, { status: answer.status, statusText: 'x' });
    } else {
      request.flush(answer);
    }
    await settle(harness);
  }

  it('shows a busy skeleton while the case loads', async () => {
    await open('pending');
    expect(root().querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull();
    httpMock.expectOne(CASE).flush(kycCase());
  });

  it('lays out the case: facts, documents and the decision form', async () => {
    await open(kycCase());
    const text = textOf(root());
    expect(text).toContain('Khun Somchai');
    expect(text).toContain('National ID card');
    expect(text).toContain('Degree or diploma');
    expect(text).toContain('Decision');
    expect(root().querySelector('input[name="kyc-decision"]')).not.toBeNull();
  });

  it('opens a document in the page only on request, shows the logging notice and revokes the URL when closed', async () => {
    await open(kycCase());
    httpMock.expectNone(CONTENT('doc-1'));
    expect(root().querySelector('app-kyc-document-viewer')).toBeNull();

    (root().querySelector('#kyc-view-doc-1') as HTMLButtonElement).click();
    await settle(harness);
    expect(textOf(root())).toContain('This access is logged');
    httpMock.expectOne(CONTENT('doc-1')).flush(new Blob(['x'], { type: 'image/png' }));
    await settle(harness);
    expect(root().querySelector('img')?.getAttribute('src')).toBe('blob:case/1');

    (controlByText(root(), 'Close document') as HTMLButtonElement).click();
    await settle(harness);
    expect(root().querySelector('app-kyc-document-viewer')).toBeNull();
    expect(revoked).toEqual(['blob:case/1']);
  });

  it('opens the access log of a document', async () => {
    await open(kycCase());
    (Array.from(root().querySelectorAll<HTMLButtonElement>('td button')).find((button) => button.textContent?.includes('Access log')) as HTMLButtonElement).click();
    await settle(harness);
    httpMock.expectOne((r) => r.url === '/api/tutoring/admin/kyc/documents/doc-1/access-logs').flush({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 });
    await settle(harness);
    expect(root().querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('says the request does not exist for a 404', async () => {
    await open({ status: 404, body: problemBody(404, 'tutoring.not_found', 'not_found') });
    expect(textOf(root())).toContain('Request not found');
  });

  it('says the feature is off, not that something broke, for the disabled answer', async () => {
    await open({ status: 503, body: problemBody(503, 'tutoring.kyc.disabled', 'unavailable') });
    expect(textOf(root())).toContain('Identity checks are not switched on');
  });

  it('shows the server\'s reason for another failure, with a retry that loads again', async () => {
    await open({ status: 500, body: { title: 'x' } });
    expect(textOf(root())).toContain('Could not load this');
    (Array.from(root().querySelectorAll('app-button button')).find((button) => button.textContent?.includes('Try again')) as HTMLButtonElement).click();
    await settle(harness);
    httpMock.expectOne(CASE).flush(kycCase());
  });

  it('collects the reviewer\'s verdicts and sends them with the decision, then shows the case as the server returns it', async () => {
    await open(kycCase());
    for (const id of ['doc-1', 'doc-2']) {
      (root().querySelectorAll<HTMLInputElement>(`input[name="verdict-${id}"]`)[1]).click();
    }
    await settle(harness);
    const approve = Array.from(root().querySelectorAll<HTMLInputElement>('input[name="kyc-decision"]')).find((input) => input.closest('label')?.textContent?.includes('Approve')) as HTMLInputElement;
    approve.click();
    await settle(harness);
    (controlByText(root(), 'Review before confirming') as HTMLButtonElement).click();
    await settle(harness);
    (root().querySelector('[role="dialog"] app-button:last-child button') as HTMLButtonElement).click();

    const request = httpMock.expectOne(`${CASE}/decision`);
    expect(request.request.body.documents).toEqual([
      { documentId: 'doc-1', status: 'Approved' },
      { documentId: 'doc-2', status: 'Approved' },
    ]);
    request.flush(kycCase({ status: 'Approved', documents: kycCase().documents.map((document) => ({ ...document, status: 'Approved' as const })) }));
    await settle(harness);
    expect(textOf(root())).toContain('This request cannot be decided now');
    expect(root().querySelector('input[name="verdict-doc-1"]')).toBeNull();
  });

  it('reloads the case with a notice when someone changed it under the reviewer', async () => {
    await open(kycCase());
    for (const id of ['doc-1', 'doc-2']) {
      root().querySelectorAll<HTMLInputElement>(`input[name="verdict-${id}"]`)[1].click();
    }
    const approve = Array.from(root().querySelectorAll<HTMLInputElement>('input[name="kyc-decision"]')).find((input) => input.closest('label')?.textContent?.includes('Approve')) as HTMLInputElement;
    approve.click();
    await settle(harness);
    (controlByText(root(), 'Review before confirming') as HTMLButtonElement).click();
    await settle(harness);
    (root().querySelector('[role="dialog"] app-button:last-child button') as HTMLButtonElement).click();
    httpMock.expectOne(`${CASE}/decision`).flush(problemBody(409, 'tutoring.kyc.case_already_decided', 'conflict'), { status: 409, statusText: 'Conflict' });
    await settle(harness);

    httpMock.expectOne(CASE).flush(kycCase({ status: 'Approved' }));
    await settle(harness);
    expect(textOf(root())).toContain('This request has already been decided.');
    expect(textOf(root())).toContain('The latest version is loaded');
  });
});
