import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { tutorItem } from '../testing/fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf, typeInto, useEnglish } from '../testing/spec-helpers';
import { AdminTutorsPage } from './admin-tutors-page';

@Component({ template: '' })
class RouteStub {}

const LIST = (r: { url: string }): boolean => r.url === '/api/tutoring/admin/tutors';

describe('AdminTutorsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'admin/tutoring/tutors', component: AdminTutorsPage }, { path: '**', component: RouteStub }]), ...HTTP_TEST_PROVIDERS],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const page = (items = [tutorItem()]): object => ({ items, totalCount: items.length, page: 1, pageSize: 20, totalPages: 1 });

  async function open(url = '/admin/tutoring/tutors', answer: object = page()): Promise<void> {
    await harness.navigateByUrl(url, AdminTutorsPage);
    await settle(harness);
    httpMock.expectOne(LIST).flush(answer);
    await settle(harness);
  }

  it('lists the tutors with the figures an administrator triages on', async () => {
    await open('/admin/tutoring/tutors', page([tutorItem(), tutorItem({ tutorId: 't-2', displayName: 'Khun Malee', status: 'Suspended', isListed: false, ratingCount: 0, commissionPercentOverride: 15 })]));
    const text = textOf(root());
    expect(text).toContain('Khun Somchai');
    expect(text).toContain('4.7 (12)');
    expect(text).toContain('Suspended');
    expect(text).toContain('No reviews');
    expect(text).toContain('15%');
    expect(text).toContain('Default');
    expect(root().querySelector('a[href="/admin/tutoring/tutors/tutor-1"]')).not.toBeNull();
    expect(root().querySelector('.overflow-x-auto table')).not.toBeNull();
  });

  it('reads the filters from the URL and asks the API for exactly those', async () => {
    await harness.navigateByUrl('/admin/tutoring/tutors?status=Suspended&q=som&page=2', AdminTutorsPage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('status')).toBe('Suspended');
    expect(request.request.params.get('q')).toBe('som');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page());
    await settle(harness);
    expect((root().querySelector('input[type="search"]') as HTMLInputElement).value).toBe('som');
  });

  it('ignores a status it does not know', async () => {
    await harness.navigateByUrl('/admin/tutoring/tutors?status=Bogus', AdminTutorsPage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.has('status')).toBe(false);
    request.flush(page());
  });

  it('searches through the URL, from page 1', async () => {
    await open('/admin/tutoring/tutors?page=3');
    typeInto(root().querySelector('input[type="search"]'), '  mint ');
    (buttonByText(root(), 'Search') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/admin/tutoring/tutors?q=mint'));
    await settle(harness);
    httpMock.expectOne(LIST).flush(page([]));
  });

  it('says there are none, and offers to clear the filters when some are set', async () => {
    await open('/admin/tutoring/tutors?status=Rejected', page([]));
    const text = textOf(root());
    expect(text).toContain('No tutors match');
    expect(buttonByText(root(), 'Clear filters')).not.toBeNull();
  });

  it('shows a busy skeleton while loading and a retry when loading fails', async () => {
    await harness.navigateByUrl('/admin/tutoring/tutors', AdminTutorsPage);
    await settle(harness);
    expect(root().querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull();
    httpMock.expectOne(LIST).flush({}, { status: 500, statusText: 'Server Error' });
    await settle(harness);
    expect(textOf(root())).toContain('Could not load tutors');
    (buttonByText(root(), 'Try again') as HTMLButtonElement).click();
    await settle(harness);
    httpMock.expectOne(LIST).flush(page());
  });
});
