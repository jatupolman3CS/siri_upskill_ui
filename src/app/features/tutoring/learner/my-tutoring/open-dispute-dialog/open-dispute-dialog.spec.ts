import { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { dispute, disputeState } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { OpenDisputeDialog } from './open-dispute-dialog';

@Component({ imports: [OpenDisputeDialog], template: `<app-open-dispute-dialog [(open)]="open" bookingId="b-1" />` })
class Host {
  readonly open = signal(false);
}

@Component({ template: '' })
class RouteStub {}

const STATE = '/api/tutoring/bookings/b-1/dispute';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('OpenDisputeDialog', () => {
  let fixture: ComponentFixture<Host>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([{ path: 'my-tutoring/disputes/:id', component: RouteStub }]), ...HTTP_TEST_PROVIDERS],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function openWith(body: object): Promise<void> {
    fixture.componentInstance.open.set(true);
    await settle(fixture);
    httpMock.expectOne(STATE).flush(body);
    await settle(fixture);
  }

  function type(selector: string, value: string): void {
    const field = root().querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  function choose(category: string): void {
    const select = root().querySelector('select') as HTMLSelectElement;
    select.value = category;
    select.dispatchEvent(new Event('change'));
  }

  it('asks the server nothing while it is closed', () => {
    httpMock.expectNone(STATE);
  });

  it('shows a busy skeleton while the server is asked whether a report can be opened', async () => {
    fixture.componentInstance.open.set(true);
    await settle(fixture);

    expect(root().querySelector('[role="status"][aria-label="Checking whether you can report a problem"]')).not.toBeNull();
    httpMock.expectOne(STATE).flush(disputeState());
  });

  it('shows an error with a retry when the state cannot be loaded', async () => {
    fixture.componentInstance.open.set(true);
    await settle(fixture);
    httpMock.expectOne(STATE).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(textOf(root())).toContain('We could not check this. Try again.');
    buttonByText(root(), 'Try again')?.click();
    await settle(fixture);
    httpMock.expectOne(STATE).flush(disputeState());
    await settle(fixture);

    expect(root().querySelector('form')).not.toBeNull();
  });

  it.each([
    ['window_closed', 'The time to report a problem with this lesson has passed.'],
    ['status_not_eligible', 'A problem cannot be reported for this lesson in its current state.'],
    ['limit_reached', 'You have too many open reports.'],
  ] as const)('explains why a report cannot be opened (%s) and offers no form', async (reasonCode, sentence) => {
    await openWith(disputeState({ canOpen: false, reasonCode, allowedCategories: [], flow: null }));

    expect(textOf(root())).toContain(sentence);
    expect(root().querySelector('form')).toBeNull();
    expect(buttonByText(root(), 'Send report')).toBeNull();
  });

  it('links to the report that already exists', async () => {
    await openWith(
      disputeState({ canOpen: false, reasonCode: 'already_open', allowedCategories: [], dispute: { disputeId: 'd-7', disputeNo: 'DP-2610-ZZ99', status: 'Open' } }),
    );

    const link = Array.from(root().querySelectorAll('a')).find((a) => a.textContent?.includes('DP-2610-ZZ99'));
    expect(link?.getAttribute('href')).toBe('/my-tutoring/disputes/d-7');
  });

  it('warns that the payment will be held and that contact details are not allowed, before anything is sent', async () => {
    await openWith(disputeState());

    const text = textOf(root());
    expect(text).toContain('the payment for this class is held');
    expect(text).toContain('neither paid to the tutor nor refunded until a decision is made');
    expect(text).toContain('Please do not include phone numbers, e-mail addresses');
    expect(text).toContain('You can report a problem until 21 Oct 2026 19:00.');
  });

  it('omits the payment warning when the server says nothing will be held', async () => {
    await openWith(disputeState({ fundsWillBeHeld: false }));

    expect(textOf(root())).not.toContain('is held');
  });

  it('offers only the categories the server allows', async () => {
    await openWith(disputeState({ allowedCategories: ['NoClass', 'Other'] }));

    const options = Array.from(root().querySelectorAll('option')).map((option) => option.textContent?.trim());
    expect(options).toEqual(['Choose a category', 'The class did not take place', 'Something else']);
  });

  it('will not send without a category and a description of enough length, and says what is wrong', async () => {
    await openWith(disputeState());

    buttonByText(root(), 'Send report')?.click();
    await settle(fixture);

    httpMock.expectNone((req) => req.method === 'POST');
    const text = textOf(root());
    expect(text).toContain('Choose what happened.');
    expect(text).toContain('This field is required.');
  });

  it('opens the report with the category, the trimmed description and the evidence, then goes to the case', async () => {
    await openWith(disputeState());

    choose('NoClass');
    type('textarea', '  The tutor never joined the room.  ');
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Add a link'))?.click();
    await settle(fixture);
    type('fieldset input', 'https://files.example.test/proof.png');
    await settle(fixture);
    buttonByText(root(), 'Send report')?.click();
    await settle(fixture);

    const post = httpMock.expectOne((req) => req.url === STATE && req.method === 'POST');
    const body = post.request.body as { category: string; description: string; evidenceLinks: unknown; clientRequestId: string };
    expect(body.category).toBe('NoClass');
    expect(body.description).toBe('The tutor never joined the room.');
    expect(body.evidenceLinks).toEqual([{ url: 'https://files.example.test/proof.png', label: null }]);
    expect(body.clientRequestId).toMatch(UUID);
    post.flush(dispute({ disputeId: 'd-9' }), { status: 201, statusText: 'Created' });
    await settle(fixture);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(router.url).toBe('/my-tutoring/disputes/d-9');
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('sends no evidence (null) when none was added', async () => {
    await openWith(disputeState());
    choose('Other');
    type('textarea', 'Something unexpected happened.');

    buttonByText(root(), 'Send report')?.click();
    await settle(fixture);

    const post = httpMock.expectOne((req) => req.url === STATE && req.method === 'POST');
    expect((post.request.body as { evidenceLinks: unknown }).evidenceLinks).toBeNull();
    post.flush(dispute(), { status: 201, statusText: 'Created' });
  });

  it('keeps the same idempotency key when a send is repeated after a failure, so a lost answer never opens two reports', async () => {
    await openWith(disputeState());
    choose('Other');
    type('textarea', 'Something unexpected happened.');

    buttonByText(root(), 'Send report')?.click();
    await settle(fixture);
    const first = httpMock.expectOne((req) => req.url === STATE && req.method === 'POST');
    const id = (first.request.body as { clientRequestId: string }).clientRequestId;
    first.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    buttonByText(root(), 'Send report')?.click();
    await settle(fixture);
    const second = httpMock.expectOne((req) => req.url === STATE && req.method === 'POST');

    expect((second.request.body as { clientRequestId: string }).clientRequestId).toBe(id);
    second.flush(dispute(), { status: 201, statusText: 'Created' });
  });

  it('cannot be sent twice while the request is in flight', async () => {
    await openWith(disputeState());
    choose('Other');
    type('textarea', 'Something unexpected happened.');

    const button = buttonByText(root(), 'Send report');
    button?.click();
    button?.click();
    await settle(fixture);

    httpMock.expectOne((req) => req.url === STATE && req.method === 'POST').flush(dispute(), { status: 201, statusText: 'Created' });
  });

  it('links to the existing report when the server says one is already open', async () => {
    await openWith(disputeState());
    choose('Other');
    type('textarea', 'Something unexpected happened.');

    buttonByText(root(), 'Send report')?.click();
    await settle(fixture);
    httpMock
      .expectOne((req) => req.url === STATE && req.method === 'POST')
      .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.dispute_already_open', disputeId: 'd-5' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    expect(textOf(root())).toContain('A report for this lesson is already open.');
    expect(Array.from(root().querySelectorAll('a')).some((a) => a.getAttribute('href') === '/my-tutoring/disputes/d-5')).toBe(true);
  });

  it('shows a refusal of contact details under the description and keeps what was typed', async () => {
    await openWith(disputeState());
    choose('Other');
    type('textarea', 'Call me on 0812345678 please');

    buttonByText(root(), 'Send report')?.click();
    await settle(fixture);
    httpMock
      .expectOne((req) => req.url === STATE && req.method === 'POST')
      .flush({ title: 'Bad', status: 400, errorCode: 'validation', reason: 'tutoring.dispute_text_contains_contact' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);

    expect(textOf(root())).toContain('Please remove phone numbers and e-mail addresses.');
    expect((root().querySelector('textarea') as HTMLTextAreaElement).value).toBe('Call me on 0812345678 please');
  });

  it('will not send an evidence link that is not https', async () => {
    await openWith(disputeState());
    choose('Other');
    type('textarea', 'Something unexpected happened.');
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Add a link'))?.click();
    await settle(fixture);
    type('fieldset input', 'http://insecure.example.test/x');
    await settle(fixture);

    buttonByText(root(), 'Send report')?.click();
    await settle(fixture);

    httpMock.expectNone((req) => req.method === 'POST');
    expect(textOf(root())).toContain('Only secure links starting with https:// are accepted.');
  });
});
