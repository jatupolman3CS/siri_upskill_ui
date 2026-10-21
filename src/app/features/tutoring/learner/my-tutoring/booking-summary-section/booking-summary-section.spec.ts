import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { summary } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { BookingSummarySection } from './booking-summary-section';

const URL = '/api/tutoring/bookings/b-1/summary';

describe('BookingSummarySection', () => {
  let fixture: ComponentFixture<BookingSummarySection>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [BookingSummarySection], providers: [...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BookingSummarySection);
    fixture.componentRef.setInput('bookingId', 'b-1');
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('shows a busy skeleton while the summary loads', () => {
    expect(root().querySelector('[role="status"][aria-label="Loading the lesson summary"]')).not.toBeNull();
    httpMock.expectOne(URL).flush(summary());
  });

  it('shows what was covered, the feedback, the homework and the next steps, as text', async () => {
    httpMock.expectOne(URL).flush(summary());
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('What was covered');
    expect(text).toContain('Newton laws');
    expect(text).toContain('Feedback for the learner');
    expect(text).toContain('Mint did well.');
    expect(text).toContain('Exercise 4');
    expect(text).toContain('Revise formulas');
    expect(text).toContain('Written on 20 Oct 2026');
  });

  it('renders the tutor text as text, never as markup', async () => {
    httpMock.expectOne(URL).flush(summary({ topicsCovered: '<img src=x onerror=alert(1)>', feedback: null, homework: null, nextSteps: null }));
    await settle(fixture);

    expect(root().querySelector('img')).toBeNull();
    expect(textOf(root())).toContain('<img src=x onerror=alert(1)>');
  });

  it('leaves out the parts the tutor did not write', async () => {
    httpMock.expectOne(URL).flush(summary({ feedback: null, homework: null, nextSteps: null }));
    await settle(fixture);

    expect(textOf(root())).not.toContain('Homework');
    expect(textOf(root())).not.toContain('Next steps');
  });

  it('reads "not written yet" (a 404) as a gentle note, not as an error', async () => {
    httpMock.expectOne(URL).flush({ title: 'Not found', status: 404, errorCode: 'not_found', reason: 'tutoring.not_found' }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);

    expect(textOf(root())).toContain('Your tutor has not written a summary yet');
    expect(buttonByText(root(), 'Try again')).toBeNull();
  });

  it('shows an error with a retry for a failure that is not a 404', async () => {
    httpMock.expectOne(URL).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(textOf(root())).toContain('We could not load the lesson summary.');
    buttonByText(root(), 'Try again')?.click();
    await settle(fixture);
    httpMock.expectOne(URL).flush(summary());
    await settle(fixture);

    expect(textOf(root())).toContain('Newton laws');
  });
});
