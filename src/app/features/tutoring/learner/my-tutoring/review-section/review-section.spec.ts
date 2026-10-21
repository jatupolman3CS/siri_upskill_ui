import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { review, reviewState } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { ReviewSection } from './review-section';

const URL = '/api/tutoring/bookings/b-1/review';

describe('ReviewSection', () => {
  let fixture: ComponentFixture<ReviewSection>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ReviewSection], providers: [...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReviewSection);
    fixture.componentRef.setInput('bookingId', 'b-1');
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const radios = (): HTMLInputElement[] => Array.from(root().querySelectorAll<HTMLInputElement>('input[type="radio"]'));

  async function answerState(body: object): Promise<void> {
    httpMock.expectOne(URL).flush(body);
    await settle(fixture);
  }

  function type(selector: string, value: string): void {
    const field = root().querySelector(selector) as HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('shows a busy skeleton while the state loads', () => {
    expect(root().querySelector('[role="status"][aria-label="Loading your review"]')).not.toBeNull();
    httpMock.expectOne(URL).flush(reviewState());
  });

  it('shows an error with a retry that reads the state again', async () => {
    httpMock.expectOne(URL).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(textOf(root())).toContain('We could not load your review.');
    buttonByText(root(), 'Try again')?.click();
    await settle(fixture);
    await answerState(reviewState());

    expect(root().querySelector('form')).not.toBeNull();
  });

  it('hides the whole section when the server has switched reviews off', async () => {
    await answerState(reviewState({ canReview: false, reasonCode: 'disabled' }));

    expect(root().querySelector('section')).toBeNull();
  });

  it.each([
    ['refunded', 'This lesson was refunded in full, so it cannot be reviewed.'],
    ['window_closed', 'The time to review this lesson has passed.'],
    ['booking_not_completed', 'A review can be written once the lesson is completed.'],
  ] as const)('explains why a review cannot be written (%s)', async (reasonCode, sentence) => {
    await answerState(reviewState({ canReview: false, reasonCode }));

    expect(textOf(root())).toContain(sentence);
    expect(root().querySelector('form')).toBeNull();
  });

  it('adds when the review window closed', async () => {
    await answerState(reviewState({ canReview: false, reasonCode: 'window_closed', reviewableUntilUtc: '2026-12-01T00:00:00Z' }));

    expect(textOf(root())).toContain('The review period ended on 1 Dec 2026.');
  });

  it('offers the form with the public notice, the reviewer-label rule and the radio group of stars', async () => {
    await answerState(reviewState());

    const text = textOf(root());
    expect(text).toContain('Reviews are public. Do not include a real name, phone number or e-mail address.');
    expect(text).toContain("never the child's nickname");
    expect(text).toContain('You can write a review until 18 Jan 2027.');
    expect(radios()).toHaveLength(5);
    expect(root().querySelector('textarea')).not.toBeNull();
  });

  it('warns that an anonymous review may still be recognised by the tutor, only once the box is ticked', async () => {
    await answerState(reviewState());
    expect(textOf(root())).not.toContain('The tutor may still guess');

    (root().querySelector('app-checkbox input') as HTMLInputElement).click();
    await settle(fixture);

    expect(textOf(root())).toContain('The tutor may still guess it is yours from when it was sent.');
  });

  it('will not send a review without a rating, and says so beside the stars', async () => {
    await answerState(reviewState());

    buttonByText(root(), 'Send review')?.click();
    await settle(fixture);

    httpMock.expectNone(URL);
    expect(textOf(root())).toContain('Choose a rating from 1 to 5 stars.');
  });

  it('sends the rating, the trimmed comment and the anonymous flag, then shows the saved review', async () => {
    await answerState(reviewState());

    radios()[3].click();
    type('textarea', '  Clear explanations.  ');
    (root().querySelector('app-checkbox input') as HTMLInputElement).click();
    buttonByText(root(), 'Send review')?.click();
    await settle(fixture);

    const post = httpMock.expectOne((req) => req.url === URL && req.method === 'POST');
    expect(post.request.body).toEqual({ rating: 4, comment: 'Clear explanations.', anonymous: true });
    post.flush(review({ rating: 4, anonymous: true }), { status: 201, statusText: 'Created' });
    await settle(fixture);
    await answerState(reviewState({ canReview: false, reasonCode: 'exists', review: review({ rating: 4, anonymous: true }) }));

    expect(textOf(root())).toContain('Clear explanations.');
    expect(textOf(root())).toContain('Shown to the public as anonymous');
    expect(root().querySelector('form')).toBeNull();
  });

  it('sends no comment (null) when none was written', async () => {
    await answerState(reviewState());

    radios()[4].click();
    buttonByText(root(), 'Send review')?.click();
    await settle(fixture);

    const post = httpMock.expectOne((req) => req.url === URL && req.method === 'POST');
    expect(post.request.body).toEqual({ rating: 5, comment: null, anonymous: false });
    post.flush(review({ rating: 5, comment: null }), { status: 201, statusText: 'Created' });
    await settle(fixture);
    httpMock.expectOne(URL).flush(reviewState({ canReview: false, reasonCode: 'exists', review: review({ rating: 5, comment: null }) }));
  });

  it('cannot be sent twice while the request is in flight', async () => {
    await answerState(reviewState());
    radios()[1].click();

    const button = buttonByText(root(), 'Send review');
    button?.click();
    button?.click();
    await settle(fixture);

    const post = httpMock.expectOne((req) => req.url === URL && req.method === 'POST');
    post.flush(review(), { status: 201, statusText: 'Created' });
    await settle(fixture);
    httpMock.expectOne(URL).flush(reviewState({ canReview: false, review: review() }));
  });

  it('shows a refusal of the comment (contact details) under the comment and keeps what was typed', async () => {
    await answerState(reviewState());
    radios()[4].click();
    type('textarea', 'Call me on 0812345678');

    buttonByText(root(), 'Send review')?.click();
    await settle(fixture);
    httpMock
      .expectOne((req) => req.url === URL && req.method === 'POST')
      .flush({ title: 'Bad', status: 400, errorCode: 'validation', reason: 'tutoring.review_comment_contains_contact' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);

    expect(textOf(root())).toContain('The comment cannot contain phone numbers or e-mail addresses.');
    expect((root().querySelector('textarea') as HTMLTextAreaElement).value).toBe('Call me on 0812345678');
  });

  it('shows the existing review when a second one is refused (review_exists)', async () => {
    await answerState(reviewState());
    radios()[4].click();

    buttonByText(root(), 'Send review')?.click();
    await settle(fixture);
    httpMock
      .expectOne((req) => req.url === URL && req.method === 'POST')
      .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.review_exists', reviewId: 'rev-1' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    await answerState(reviewState({ canReview: false, reasonCode: 'exists', review: review() }));

    expect(textOf(root())).toContain('Clear explanations.');
  });

  it('shows another server refusal as a banner', async () => {
    await answerState(reviewState());
    radios()[4].click();

    buttonByText(root(), 'Send review')?.click();
    await settle(fixture);
    httpMock
      .expectOne((req) => req.url === URL && req.method === 'POST')
      .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.review_window_closed' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    expect(root().querySelector('[role="alert"]')?.textContent).toContain('The time to review this lesson has passed.');
  });

  it('shows the learner their own review with the stars as an image and the comment as text', async () => {
    await answerState(reviewState({ canReview: false, reasonCode: 'exists', review: review({ rating: 4, comment: '<b>Clear</b>' }) }));

    expect(root().querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('4 of 5 stars');
    expect(root().querySelector('b')).toBeNull();
    expect(textOf(root())).toContain('<b>Clear</b>');
    expect(buttonByText(root(), 'Edit review')).toBeNull();
  });

  it('tells the author a hidden review is hidden - with no reason - and offers no edit', async () => {
    await answerState(reviewState({ canReview: false, reasonCode: 'exists', review: review({ status: 'Hidden' }), canEdit: true }));

    expect(textOf(root())).toContain('Your review is hidden and is not shown to the public.');
    expect(buttonByText(root(), 'Edit review')).toBeNull();
  });

  it('edits a review only when the server allows it, pre-filled, with PUT', async () => {
    await answerState(reviewState({ canReview: false, reasonCode: 'exists', review: review({ rating: 3, comment: 'Ok' }), canEdit: true, editableUntilUtc: '2026-10-22T12:00:00Z' }));
    expect(textOf(root())).toContain('You can edit it until 22 Oct 2026 19:00.');

    buttonByText(root(), 'Edit review')?.click();
    await settle(fixture);
    expect(radios()[2].checked).toBe(true);
    expect((root().querySelector('textarea') as HTMLTextAreaElement).value).toBe('Ok');

    radios()[4].click();
    buttonByText(root(), 'Save changes')?.click();
    await settle(fixture);

    const put = httpMock.expectOne((req) => req.url === URL && req.method === 'PUT');
    expect(put.request.body).toEqual({ rating: 5, comment: 'Ok', anonymous: false });
    put.flush(review({ rating: 5, comment: 'Ok' }));
    await settle(fixture);
    await answerState(reviewState({ canReview: false, reasonCode: 'exists', review: review({ rating: 5, comment: 'Ok' }) }));

    expect(root().querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('5 of 5 stars');
  });

  it('lets the learner back out of an edit', async () => {
    await answerState(reviewState({ canReview: false, reasonCode: 'exists', review: review(), canEdit: true }));

    buttonByText(root(), 'Edit review')?.click();
    await settle(fixture);
    buttonByText(root(), 'Cancel')?.click();
    await settle(fixture);

    expect(root().querySelector('form')).toBeNull();
    expect(textOf(root())).toContain('Clear explanations.');
  });
});
