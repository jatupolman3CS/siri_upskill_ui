import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { kycCaseItem } from '../testing/fixtures';
import { HTTP_TEST_PROVIDERS, controlByText, problemBody, settle, textOf, useEnglish } from '../testing/spec-helpers';
import { AdminKycQueuePage } from './admin-kyc-queue-page';

@Component({ template: '' })
class RouteStub {}

const LIST = (r: { url: string }): boolean => r.url === '/api/tutoring/admin/kyc/cases';

describe('AdminKycQueuePage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'admin/tutoring/kyc', component: AdminKycQueuePage }, { path: 'admin/tutoring/kyc/:caseId', component: RouteStub }, { path: '**', component: RouteStub }]), ...HTTP_TEST_PROVIDERS],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;

  async function open(url: string, answer: object | 'error' | { status: number; body: object }): Promise<void> {
    await harness.navigateByUrl(url, AdminKycQueuePage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    if (answer === 'error') {
      request.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    } else if ('status' in answer && 'body' in answer) {
      request.flush(answer.body, { status: answer.status, statusText: 'x' });
    } else {
      request.flush(answer);
    }
    await settle(harness);
  }

  const page = (items = [kycCaseItem()], totalPages = 1): object => ({ items, totalCount: items.length, page: 1, pageSize: 20, totalPages });

  it('asks for the cases that wait for a decision by default and lists them with their wait', async () => {
    await harness.navigateByUrl('/admin/tutoring/kyc', AdminKycQueuePage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('status')).toBe('Submitted,InReview');
    request.flush(page());
    await settle(harness);

    const text = textOf(root());
    expect(text).toContain('Khun Somchai');
    expect(text).toContain('Attempt 1');
    expect(text).toContain('30 h');
    expect(root().querySelector('a[href="/admin/tutoring/kyc/case-1"]')).not.toBeNull();
    expect(root().querySelector('.overflow-x-auto table')).not.toBeNull();
  });

  it('puts the status filter and the page in the URL and asks for exactly that', async () => {
    await harness.navigateByUrl('/admin/tutoring/kyc?status=Approved&page=2', AdminKycQueuePage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('status')).toBe('Approved');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page());
  });

  it('ignores a status it does not know instead of sending it to the API', async () => {
    await harness.navigateByUrl('/admin/tutoring/kyc?status=Bogus', AdminKycQueuePage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('status')).toBe('Submitted,InReview');
    request.flush(page());
  });

  it('changes the filter through the URL when a status chip is pressed', async () => {
    await open('/admin/tutoring/kyc', page());
    controlByText(root(), 'Not approved')?.click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/admin/tutoring/kyc?status=Rejected'));
    await settle(harness);
    httpMock.expectOne(LIST).flush(page([]));
  });

  it('says nothing is waiting when the default view is empty', async () => {
    await open('/admin/tutoring/kyc', page([]));
    expect(textOf(root())).toContain('Nothing waiting for review');
  });

  it('shows a busy skeleton while loading', async () => {
    await harness.navigateByUrl('/admin/tutoring/kyc', AdminKycQueuePage);
    await settle(harness);
    expect(root().querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull();
    httpMock.expectOne(LIST).flush(page());
  });

  it('reports a failed load with a retry that asks again', async () => {
    await open('/admin/tutoring/kyc', 'error');
    expect(textOf(root())).toContain('Could not load this');
    (Array.from(root().querySelectorAll('app-button')).find((host) => host.textContent?.includes('Try again'))?.querySelector('button') as HTMLButtonElement).click();
    await settle(harness);
    httpMock.expectOne(LIST).flush(page());
  });

  it('shows the switched-off state, not an error, when the feature is disabled on the server', async () => {
    await open('/admin/tutoring/kyc', { status: 503, body: problemBody(503, 'tutoring.kyc.disabled', 'unavailable') });
    const text = textOf(root());
    expect(text).toContain('Identity checks are not switched on');
    expect(text).not.toContain('Could not load');
    expect(root().querySelector('[role="group"]')).toBeNull();
  });
});
