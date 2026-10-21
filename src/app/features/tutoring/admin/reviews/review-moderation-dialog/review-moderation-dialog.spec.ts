import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { adminReviewListItem } from '../../../testing/review-fixtures';
import { settle, useEnglish } from '../../testing/spec-helpers';
import { ReviewModerationDialog } from './review-moderation-dialog';

const REVIEW = adminReviewListItem();

describe('ReviewModerationDialog', () => {
  let fixture: ComponentFixture<ReviewModerationDialog>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReviewModerationDialog);
    fixture.componentRef.setInput('review', REVIEW);
    fixture.componentRef.setInput('mode', 'hide');
    fixture.componentInstance.open.set(true);
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  it('rejects hiding without a reason', async () => {
    fixture.componentInstance.confirm();
    await settle(fixture);

    expect(fixture.componentInstance['problem']()).toBe('A reason is required');
  });

  it('hides a review with a reason and emits done', async () => {
    let emitted = false;
    fixture.componentInstance.done.subscribe(() => {
      emitted = true;
    });

    fixture.componentInstance['reasonControl'].setValue('Inappropriate content');
    fixture.componentInstance.confirm();
    await settle(fixture);

    const req = httpMock.expectOne(`/api/tutoring/admin/reviews/${REVIEW.reviewId}/hide`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Inappropriate content' });
    req.flush(null);
    await settle(fixture);

    expect(emitted).toBe(true);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('unhides a review without requiring a note', async () => {
    fixture.componentRef.setInput('mode', 'unhide');
    await settle(fixture);

    let emitted = false;
    fixture.componentInstance.done.subscribe(() => {
      emitted = true;
    });

    fixture.componentInstance.confirm();
    await settle(fixture);

    const req = httpMock.expectOne(`/api/tutoring/admin/reviews/${REVIEW.reviewId}/unhide`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
    await settle(fixture);

    expect(emitted).toBe(true);
    expect(fixture.componentInstance.open()).toBe(false);
  });
});
