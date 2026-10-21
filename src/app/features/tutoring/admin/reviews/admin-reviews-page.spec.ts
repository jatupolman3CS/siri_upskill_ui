import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { adminReviewListItem } from '../../testing/review-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf, typeInto, useEnglish } from '../testing/spec-helpers';
import { AdminReviewsPage } from './admin-reviews-page';

@Component({ template: '' })
class RouteStub {}

const LIST = (r: { url: string }): boolean => r.url === '/api/tutoring/admin/reviews';

describe('AdminReviewsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin/tutoring/reviews', component: AdminReviewsPage },
          { path: '**', component: RouteStub },
        ]),
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const pageResult = (items = [adminReviewListItem()]): object => ({
    items,
    totalCount: items.length,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });

  let component: AdminReviewsPage;

  async function open(url = '/admin/tutoring/reviews', answer: object = pageResult()): Promise<void> {
    component = await harness.navigateByUrl(url, AdminReviewsPage);
    await settle(harness);
    httpMock.expectOne(LIST).flush(answer);
    await settle(harness);
  }

  it('lists the reviews with tutor name, booking, reviewer, rating, comment and status', async () => {
    await open();
    const text = textOf(root());
    expect(text).toContain('Nina Tutor');
    expect(text).toContain('BK-2026-0001');
    expect(text).toContain('Somchai');
    expect(text).toContain('Very helpful tutor!');
    expect(text).toContain('Published');
    expect(root().querySelector('a[href="/admin/tutoring/tutors/33333333-3333-3333-3333-333333333333"]')).not.toBeNull();
  });

  it('reads the filters from the URL and asks the API for exactly those', async () => {
    await harness.navigateByUrl('/admin/tutoring/reviews?status=Hidden&rating=5&q=som&page=2', AdminReviewsPage);
    await settle(harness);
    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('status')).toBe('Hidden');
    expect(request.request.params.get('rating')).toBe('5');
    expect(request.request.params.get('search')).toBe('som');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(pageResult());
    await settle(harness);
    expect((root().querySelector('input[type="search"]') as HTMLInputElement).value).toBe('som');
  });

  it('filters by status when changed in the form', async () => {
    await open();
    component['statusControl'].setValue('Hidden');
    component['applyStatus']();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toContain('status=Hidden'));
    await settle(harness);

    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('status')).toBe('Hidden');
    request.flush(pageResult());
  });

  it('searches when the search form is submitted', async () => {
    await open();
    typeInto(root().querySelector('input[type="search"]'), 'Somchai');
    (buttonByText(root(), 'Search') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toContain('q=Somchai'));
    await settle(harness);

    const request = httpMock.expectOne(LIST);
    expect(request.request.params.get('search')).toBe('Somchai');
    request.flush(pageResult());
  });

  it('opens hide modal when hide button is clicked', async () => {
    await open();
    const hideBtn = buttonByText(root(), 'Hide review');
    expect(hideBtn).not.toBeNull();
    hideBtn?.click();
    await settle(harness);

    expect(component['dialogOpen']()).toBe(true);
    expect(component['dialogMode']()).toBe('hide');
  });

  it('opens unhide modal when unhide button is clicked on hidden review', async () => {
    const hiddenReview = adminReviewListItem({ status: 'Hidden', hideReason: 'Spam' });
    await open('/admin/tutoring/reviews', pageResult([hiddenReview]));
    const unhideBtn = buttonByText(root(), 'Unhide review');
    expect(unhideBtn).not.toBeNull();
    unhideBtn?.click();
    await settle(harness);

    expect(component['dialogOpen']()).toBe(true);
    expect(component['dialogMode']()).toBe('unhide');
  });

  it('renders empty state when no reviews found', async () => {
    await open('/admin/tutoring/reviews', { items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
    const text = textOf(root());
    expect(text).toContain('No reviews yet');
  });

  it('renders error state on API failure and retries on button click', async () => {
    await harness.navigateByUrl('/admin/tutoring/reviews', AdminReviewsPage);
    await settle(harness);
    httpMock.expectOne(LIST).error(new ProgressEvent('Network error'));
    await settle(harness);

    expect(textOf(root())).toContain('Could not load reviews');
    const retryBtn = buttonByText(root(), 'Try again');
    expect(retryBtn).not.toBeNull();
    retryBtn?.click();
    await settle(harness);
    httpMock.expectOne(LIST).flush(pageResult());
  });
});
