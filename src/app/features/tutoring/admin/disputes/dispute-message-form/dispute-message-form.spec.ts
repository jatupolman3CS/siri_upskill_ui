import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminDisputeMessage } from '../../data/admin-dispute.models';
import { disputeMessage } from '../../testing/fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, problemBody, settle, textOf, typeInto, useEnglish } from '../../testing/spec-helpers';
import { DisputeMessageForm } from './dispute-message-form';

const MESSAGES = '/api/tutoring/admin/disputes/d-1/messages';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('DisputeMessageForm', () => {
  let fixture: ComponentFixture<DisputeMessageForm>;
  let httpMock: HttpTestingController;
  let posted: AdminDisputeMessage[];

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const radio = (value: string): HTMLInputElement => Array.from(root().querySelectorAll<HTMLInputElement>('input[type="radio"]'))[value === 'Internal' ? 0 : 1];
  const send = (): HTMLButtonElement => root().querySelector('app-button button') as HTMLButtonElement;

  async function render(canMessageParties = true): Promise<void> {
    fixture.componentRef.setInput('disputeId', 'd-1');
    fixture.componentRef.setInput('canMessageParties', canMessageParties);
    await settle(fixture);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DisputeMessageForm);
    posted = [];
    fixture.componentInstance.posted.subscribe((message) => posted.push(message));
  });

  afterEach(() => httpMock.verify());

  it('defaults to an internal note - the cautious choice - and says what each choice does', async () => {
    await render();
    expect(radio('Internal').checked).toBe(true);
    expect(radio('Parties').checked).toBe(false);
    const text = textOf(root());
    expect(text).toContain('Only administrators see it. Nobody is notified.');
    expect(text).toContain('The learner and the tutor both read it and are e-mailed.');
    expect(send().textContent).toContain('Save internal note');
  });

  it('needs some text and sends nothing without it', async () => {
    await render();
    send().click();
    await settle(fixture);
    httpMock.expectNone(MESSAGES);
    expect(textOf(root())).toContain('This field is required.');
  });

  it('posts an internal note with a client id, and no user id', async () => {
    await render();
    typeInto(root().querySelector('textarea'), '  Check the room logs.  ');
    await settle(fixture);
    send().click();
    const request = httpMock.expectOne(MESSAGES);
    expect(request.request.body).toEqual({ clientMessageId: expect.stringMatching(UUID), body: 'Check the room logs.', visibility: 'Internal', evidenceLinks: null });
    request.flush(disputeMessage({ authorRole: 'Admin', visibility: 'Internal', body: 'Check the room logs.' }));
    await settle(fixture);
    expect(posted.map((message) => message.visibility)).toEqual(['Internal']);
    expect((root().querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('sends a message to the parties when that is chosen', async () => {
    await render();
    radio('Parties').click();
    typeInto(root().querySelector('textarea'), 'Please upload the receipt.');
    await settle(fixture);
    expect(send().textContent).toContain('Send to both parties');
    send().click();
    const request = httpMock.expectOne(MESSAGES);
    expect(request.request.body.visibility).toBe('Parties');
    request.flush(disputeMessage({ authorRole: 'Admin', visibility: 'Parties' }));
  });

  it('reuses the client id for a retry after a failure and makes a new one after a success', async () => {
    await render();
    typeInto(root().querySelector('textarea'), 'First try');
    await settle(fixture);
    send().click();
    const first = httpMock.expectOne(MESSAGES);
    const id = first.request.body.clientMessageId;
    first.flush(problemBody(500, 'x', 'x'), { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(textOf(root())).toContain('Something went wrong');

    send().click();
    const retry = httpMock.expectOne(MESSAGES);
    expect(retry.request.body.clientMessageId).toBe(id);
    retry.flush(disputeMessage({ visibility: 'Internal' }));
    await settle(fixture);

    typeInto(root().querySelector('textarea'), 'Second message');
    await settle(fixture);
    send().click();
    const next = httpMock.expectOne(MESSAGES);
    expect(next.request.body.clientMessageId).not.toBe(id);
    next.flush(disputeMessage({ visibility: 'Internal' }));
  });

  it('cannot be sent twice while a request is in flight', async () => {
    await render();
    typeInto(root().querySelector('textarea'), 'One message');
    await settle(fixture);
    send().click();
    await settle(fixture);
    send().click();
    httpMock.expectOne(MESSAGES).flush(disputeMessage({ visibility: 'Internal' }));
    expect(posted).toHaveLength(1);
  });

  it('locks the parties option on a closed case and sends internal notes whatever was picked', async () => {
    await render(false);
    expect(radio('Parties').disabled).toBe(true);
    expect(textOf(root())).toContain('This dispute is closed.');
    typeInto(root().querySelector('textarea'), 'Follow-up note');
    await settle(fixture);
    send().click();
    const request = httpMock.expectOne(MESSAGES);
    expect(request.request.body.visibility).toBe('Internal');
    request.flush(disputeMessage({ visibility: 'Internal' }));
  });

  it('shows the server\'s refusal of a message to the parties on a case that just closed', async () => {
    await render();
    radio('Parties').click();
    typeInto(root().querySelector('textarea'), 'Hello');
    await settle(fixture);
    send().click();
    httpMock.expectOne(MESSAGES).flush(problemBody(409, 'tutoring.dispute_closed', 'conflict'), { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(posted).toHaveLength(0);
    expect(buttonByText(root(), 'Send to both parties')).not.toBeNull();
  });
});
