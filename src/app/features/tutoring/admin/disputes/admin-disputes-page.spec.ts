import { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { AuthService } from '../../../../core/auth/auth.service';
import { disputeItem, disputeSummary } from '../testing/fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf, typeInto, useEnglish } from '../testing/spec-helpers';
import { AdminDisputesPage } from './admin-disputes-page';

@Component({ template: '' })
class RouteStub {}

const LIST = (r: { url: string }): boolean => r.url === '/api/tutoring/admin/disputes';
const SUMMARY = '/api/tutoring/admin/disputes/summary';

describe('AdminDisputesPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const page = (items = [disputeItem()], totalPages = 1): object => ({ items, totalCount: items.length, page: 1, pageSize: 20, totalPages });

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/tutoring/disputes', component: AdminDisputesPage }, { path: '**', component: RouteStub }]),
        { provide: AuthService, useValue: { currentUser: signal({ id: 'me' }) } },
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function open(url = '/admin/tutoring/disputes', list: object = page(), summary: object | 'error' = disputeSummary()): Promise<void> {
    await harness.navigateByUrl(url, AdminDisputesPage);
    await settle(harness);
    httpMock.expectOne(LIST).flush(list);
    const summaryRequest = httpMock.expectOne(SUMMARY);
    if (summary === 'error') {
      summaryRequest.flush({}, { status: 500, statusText: 'Server Error' });
    } else {
      summaryRequest.flush(summary);
    }
    await settle(harness);
  }

  it('shows the tiles, and lets the ones that match a filter be pressed', async () => {
    await open();
    const text = textOf(root());
    expect(text).toContain('Under review');
    expect(text).toContain('Money on hold');
    expect(text).toContain('฿4,500.00');
    expect(root().querySelectorAll('section button').length).toBe(5);
    expect(text).toContain('Waiting for us');
  });

  it('narrows the queue to a tile\'s filter through the URL, clearing the others', async () => {
    await open('/admin/tutoring/disputes?category=NoClass');
    (Array.from(root().querySelectorAll<HTMLButtonElement>('section button')).find((button) => button.textContent?.includes('Overdue')) as HTMLButtonElement).click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/admin/tutoring/disputes?overdue=true'));
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('overdue')).toBe('true');
    expect(request.request.params.has('category')).toBe(false);
    request.flush(page([]));
  });

  it('lists the cases with the server\'s flags, the learner as a nickname and the assignee', async () => {
    await open(
      '/admin/tutoring/disputes',
      page([
        disputeItem({ priority: 'High', isOverdue: true, repeatComplaintFlag: true, assignedToUserId: 'me' }),
        disputeItem({ disputeId: 'd-2', disputeNo: 'DS-2', assignedToUserId: 'someone', lastMessageRole: 'Admin' }),
        disputeItem({ disputeId: 'd-3', disputeNo: 'DS-3', status: 'Resolved', lastMessageRole: 'Learner' }),
      ]),
    );
    const text = textOf(root());
    expect(text).toContain('DS-261014-AB12CD');
    expect(text).toContain('Nong Mint');
    expect(text).toContain('(minor)');
    expect(text).toContain('Overdue');
    expect(text).toContain('Repeat complaint');
    expect(text).toContain('Assigned to you');
    expect(text).toContain('Assigned to another administrator');
    expect(text).toContain('Decided');
    expect(root().querySelector('a[href="/admin/tutoring/disputes/d-1"]')).not.toBeNull();
    expect(root().querySelector('.overflow-x-auto table')).not.toBeNull();
    expect(root().querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('asks for the cases still open by default and carries every filter of the URL to the API', async () => {
    await harness.navigateByUrl('/admin/tutoring/disputes?status=all&category=Behavior&flow=Escrow&priority=High&overdue=true&assignedToMe=1&needsFollowUp=true&tutorId=0190b1a4-0000-7000-8000-000000000001&q=DS-1&sort=newest&page=2', AdminDisputesPage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    const params = request.request.params;
    expect(params.get('status')).toBe('Open,UnderReview,Resolved,Rejected,Withdrawn');
    expect(params.get('category')).toBe('Behavior');
    expect(params.get('flow')).toBe('Escrow');
    expect(params.get('priority')).toBe('High');
    expect(params.get('overdue')).toBe('true');
    expect(params.get('assignedToMe')).toBe('true');
    expect(params.get('needsFollowUp')).toBe('true');
    expect(params.get('tutorId')).toBe('0190b1a4-0000-7000-8000-000000000001');
    expect(params.get('q')).toBe('DS-1');
    expect(params.get('sort')).toBe('newest');
    expect(params.get('page')).toBe('2');
    request.flush(page());
    httpMock.expectOne(SUMMARY).flush(disputeSummary());
    await settle(harness);
    expect(buttonByText(root(), 'Showing one tutor only')).not.toBeNull();
  });

  it('sends no status for the default view and drops values it does not know', async () => {
    await harness.navigateByUrl('/admin/tutoring/disputes?status=bogus&category=Bogus&tutorId=not-a-guid&sort=weird', AdminDisputesPage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    for (const key of ['status', 'category', 'tutorId', 'sort']) {
      expect(request.request.params.has(key), key).toBe(false);
    }
    request.flush(page());
    httpMock.expectOne(SUMMARY).flush(disputeSummary());
  });

  it('searches by exact number through the URL', async () => {
    await open();
    typeInto(root().querySelector('input[type="search"]'), ' DS-261014-AB12CD ');
    (buttonByText(root(), 'Search') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/admin/tutoring/disputes?q=DS-261014-AB12CD'));
    await settle(harness);
    httpMock.expectOne(LIST).flush(page([]));
  });

  it('says there are none, and offers to clear filters when some are set', async () => {
    await open('/admin/tutoring/disputes?priority=High', page([]));
    expect(textOf(root())).toContain('No disputes match');
    expect(buttonByText(root(), 'Clear filters')).not.toBeNull();
  });

  it('keeps the list working when only the summary fails', async () => {
    await open('/admin/tutoring/disputes', page(), 'error');
    const text = textOf(root());
    expect(text).toContain('The summary could not be loaded');
    expect(text).toContain('DS-261014-AB12CD');
  });

  it('reports a failed list with a retry that asks for the list and the summary again', async () => {
    await harness.navigateByUrl('/admin/tutoring/disputes', AdminDisputesPage);
    await settle(harness);
    expect(root().querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull();
    httpMock.expectOne(LIST).flush({}, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(SUMMARY).flush(disputeSummary());
    await settle(harness);
    expect(textOf(root())).toContain('Could not load disputes');
    (Array.from(root().querySelectorAll('app-empty-state app-button button')).find((button) => button.textContent?.includes('Try again')) as HTMLButtonElement).click();
    await settle(harness);
    httpMock.expectOne(LIST).flush(page());
    httpMock.expectOne(SUMMARY).flush(disputeSummary());
  });
});
