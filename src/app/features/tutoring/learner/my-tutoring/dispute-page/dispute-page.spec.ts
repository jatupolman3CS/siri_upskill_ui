import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { DisputeDetail } from '../../../data/tutoring-dispute.models';
import { dispute, evidence, message } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, exactButton, settle, textOf } from '../../testing/spec-helpers';
import { DisputePage } from './dispute-page';

@Component({ template: '' })
class RouteStub {}

const URL = '/api/tutoring/disputes/d-1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('DisputePage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'my-tutoring/disputes/:disputeId', component: DisputePage },
          { path: 'my-tutoring/bookings/:bookingId', component: RouteStub },
          { path: 'my-tutoring', component: RouteStub },
        ]),
        ...HTTP_TEST_PROVIDERS,
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;

  async function open(detail: DisputeDetail | 'error' | 'notFound' | 'pending'): Promise<void> {
    await harness.navigateByUrl('/my-tutoring/disputes/d-1', DisputePage);
    await settle(harness);
    if (detail === 'pending') {
      return;
    }
    const request = httpMock.expectOne(URL);
    if (detail === 'error') {
      request.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    } else if (detail === 'notFound') {
      request.flush({ title: 'Not found', status: 404, errorCode: 'not_found', reason: 'tutoring.dispute_not_found' }, { status: 404, statusText: 'Not Found' });
    } else {
      request.flush(detail);
    }
    await settle(harness);
  }

  function type(selector: string, value: string): void {
    const field = root().querySelector(selector) as HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('shows a busy skeleton while the report loads', async () => {
    await open('pending');

    expect(root().querySelector('[role="status"][aria-label="Loading the report"]')).not.toBeNull();
    httpMock.expectOne(URL).flush(dispute());
  });

  it('reads another account\'s report and a missing one the same way: not found', async () => {
    await open('notFound');

    expect(textOf(root())).toContain('We could not find this report');
    expect(buttonByText(root(), 'Try again')).toBeNull();
  });

  it('shows an error with a retry for a failure that is not a 404', async () => {
    await open('error');

    expect(textOf(root())).toContain('We could not load this report');
    buttonByText(root(), 'Try again')?.click();
    await settle(harness);
    httpMock.expectOne(URL).flush(dispute());
    await settle(harness);

    expect(textOf(root())).toContain('Report DP-2610-AB12');
  });

  it('shows the report: number, status, category, lesson, tutor and what was reported', async () => {
    await open(dispute());

    const text = textOf(root());
    expect(text).toContain('Report DP-2610-AB12');
    expect(text).toContain('Open');
    expect(text).toContain('The class did not take place');
    expect(text).toContain('Physics');
    expect(text).toContain('Nina Tutor');
    expect(text).toContain('The tutor never joined the room.');
    expect(text).toContain('We aim to decide by 23 Oct 2026');
  });

  it('explains neutrally that the money is held while the team looks into it', async () => {
    await open(dispute({ fundsOnHold: true }));

    expect(textOf(root())).toContain('the payment for this class is held');
    expect(textOf(root())).toContain('neither paid to the tutor nor refunded until a decision is made');
  });

  it('does not mention a hold when none is in place', async () => {
    await open(dispute({ fundsOnHold: false }));

    expect(textOf(root())).not.toContain('is held');
  });

  it('shows the evidence links with their host and opens them safely in a new tab', async () => {
    await open(dispute({ evidenceLinks: [evidence()] }));

    const link = root().querySelector('a[href="https://files.example.test/screenshot.png"]') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer nofollow');
    expect(textOf(root())).toContain('files.example.test');
  });

  it('never links an evidence address that is not https', async () => {
    await open(dispute({ evidenceLinks: [evidence({ url: 'javascript:alert(1)', host: 'javascript:alert(1)' })] }));

    expect(root().querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('lays the thread out oldest first with who wrote each message in words, and translates system lines', async () => {
    await open(
      dispute({
        messages: [
          message({ messageId: 'sys-1', kind: 'System', authorRole: 'System', isMine: false, body: 'opened' }),
          message({ messageId: 'm-1', body: 'The tutor never joined.' }),
          message({ messageId: 'm-2', authorRole: 'Tutor', isMine: false, body: 'I had a power cut.' }),
          message({ messageId: 'm-3', authorRole: 'Admin', isMine: false, body: 'We are looking into it.' }),
          message({ messageId: 'sys-2', kind: 'System', authorRole: 'System', isMine: false, body: 'a_code_from_the_future' }),
        ],
      }),
    );

    const items = Array.from(root().querySelectorAll('app-dispute-thread li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    expect(items[0]).toContain('The report was opened.');
    expect(items[1]).toContain('You');
    expect(items[1]).toContain('The tutor never joined.');
    expect(items[2]).toContain('Tutor');
    expect(items[2]).toContain('I had a power cut.');
    expect(items[3]).toContain('Support team');
    expect(items[4]).toContain('The report was updated.');
  });

  it('renders a message as text, never as markup', async () => {
    await open(dispute({ messages: [message({ body: '<img src=x onerror=alert(1)>' })] }));

    expect(root().querySelector('app-dispute-thread img')).toBeNull();
    expect(textOf(root())).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows the decision, the refund the team decided on and the note both sides can read', async () => {
    await open(
      dispute({
        status: 'Resolved',
        canPostMessage: false,
        canWithdraw: false,
        fundsOnHold: false,
        decision: { resolution: 'PartialRefund', refundAmount: 225, note: 'The tutor joined 20 minutes late.', decidedAtUtc: '2026-10-22T05:00:00Z', attendanceOverturned: false },
      }),
    );

    const text = textOf(root());
    expect(text).toContain('Partial refund');
    expect(text).toContain('Refund: ฿225.00');
    expect(text).toContain('The tutor joined 20 minutes late.');
    expect(text).toContain('Decided on 22 Oct 2026 12:00');
    expect(text).not.toContain('We aim to decide by');
  });

  it('shows no reply form and no withdraw section on a case that is closed', async () => {
    await open(dispute({ status: 'Resolved', canPostMessage: false, canWithdraw: false, withdrawBlockedReason: 'admin_decided' }));

    expect(root().querySelector('app-dispute-reply-form')).toBeNull();
    expect(textOf(root())).not.toContain('Withdraw this report');
  });

  describe('replying', () => {
    it('sends the trimmed text with a fresh message id and the evidence, then reads the case again and empties the form', async () => {
      await open(dispute());

      type('app-dispute-reply-form textarea', '  I can send the log.  ');
      Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Add a link'))?.click();
      await settle(harness);
      type('app-dispute-reply-form fieldset input', 'https://files.example.test/log.txt');
      await settle(harness);
      buttonByText(root(), 'Send message')?.click();
      await settle(harness);

      const post = httpMock.expectOne(`${URL}/messages`);
      const body = post.request.body as { clientMessageId: string; body: string; evidenceLinks: unknown };
      expect(body.body).toBe('I can send the log.');
      expect(body.clientMessageId).toMatch(UUID);
      expect(body.evidenceLinks).toEqual([{ url: 'https://files.example.test/log.txt', label: null }]);
      post.flush(message({ messageId: 'm-9' }), { status: 201, statusText: 'Created' });
      await settle(harness);
      httpMock.expectOne(URL).flush(dispute({ messages: [...dispute().messages, message({ messageId: 'm-9', body: 'I can send the log.' })] }));
      await settle(harness);

      expect((root().querySelector('app-dispute-reply-form textarea') as HTMLTextAreaElement).value).toBe('');
      expect(textOf(root())).toContain('I can send the log.');
    });

    it('announces a new message once, politely, and not on the first load', async () => {
      await open(dispute());
      expect(root().querySelector('section[aria-labelledby="dispute-thread-heading"] [role="status"]')?.textContent?.trim()).toBe('');

      type('app-dispute-reply-form textarea', 'More detail');
      buttonByText(root(), 'Send message')?.click();
      await settle(harness);
      httpMock.expectOne(`${URL}/messages`).flush(message({ messageId: 'm-9' }), { status: 201, statusText: 'Created' });
      await settle(harness);
      httpMock.expectOne(URL).flush(dispute({ messages: [...dispute().messages, message({ messageId: 'm-9', body: 'More detail' })] }));
      await settle(harness);

      expect(root().querySelector('section[aria-labelledby="dispute-thread-heading"] [role="status"]')?.textContent).toContain('A new message was added to the conversation.');
    });

    it('will not send an empty message', async () => {
      await open(dispute());

      buttonByText(root(), 'Send message')?.click();
      await settle(harness);

      httpMock.expectNone(`${URL}/messages`);
      expect(textOf(root())).toContain('This field is required.');
    });

    it('cannot be sent twice while the request is in flight', async () => {
      await open(dispute());
      type('app-dispute-reply-form textarea', 'Hello');

      const button = buttonByText(root(), 'Send message');
      button?.click();
      button?.click();
      await settle(harness);

      httpMock.expectOne(`${URL}/messages`).flush(message(), { status: 201, statusText: 'Created' });
      await settle(harness);
      httpMock.expectOne(URL).flush(dispute());
    });

    it('keeps the same message id when a send is repeated after a failure, so a lost answer never posts twice', async () => {
      await open(dispute());
      type('app-dispute-reply-form textarea', 'Hello');

      buttonByText(root(), 'Send message')?.click();
      await settle(harness);
      const first = httpMock.expectOne(`${URL}/messages`);
      const id = (first.request.body as { clientMessageId: string }).clientMessageId;
      first.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
      await settle(harness);
      buttonByText(root(), 'Send message')?.click();
      await settle(harness);

      const second = httpMock.expectOne(`${URL}/messages`);
      expect((second.request.body as { clientMessageId: string }).clientMessageId).toBe(id);
      second.flush(message(), { status: 201, statusText: 'Created' });
      await settle(harness);
      httpMock.expectOne(URL).flush(dispute());
    });

    it('shows a refusal of contact details under the message and keeps what was typed', async () => {
      await open(dispute());
      type('app-dispute-reply-form textarea', 'Email me at a@b.test');

      buttonByText(root(), 'Send message')?.click();
      await settle(harness);
      httpMock
        .expectOne(`${URL}/messages`)
        .flush({ title: 'Bad', status: 400, errorCode: 'validation', reason: 'tutoring.dispute_text_contains_contact' }, { status: 400, statusText: 'Bad Request' });
      await settle(harness);

      expect(textOf(root())).toContain('Please remove phone numbers and e-mail addresses.');
      expect((root().querySelector('app-dispute-reply-form textarea') as HTMLTextAreaElement).value).toBe('Email me at a@b.test');
    });

    it('shows another refusal (the report was closed meanwhile) as a banner', async () => {
      await open(dispute());
      type('app-dispute-reply-form textarea', 'Hello');

      buttonByText(root(), 'Send message')?.click();
      await settle(harness);
      httpMock
        .expectOne(`${URL}/messages`)
        .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.dispute_closed' }, { status: 409, statusText: 'Conflict' });
      await settle(harness);

      expect(root().querySelector('[role="alert"]')?.textContent).toContain('This report is closed, so it cannot change.');
    });
  });

  describe('withdrawing', () => {
    it('asks first, explains what withdrawing does, and only then sends', async () => {
      await open(dispute());

      buttonByText(root(), 'Withdraw report')?.click();
      await settle(harness);
      expect(textOf(root())).toContain('Withdrawing closes the report and the payment goes back to normal handling.');
      httpMock.expectNone(`${URL}/withdraw`);

      exactButton(root(), 'Withdraw')?.click();
      await settle(harness);
      const post = httpMock.expectOne(`${URL}/withdraw`);
      expect(post.request.body).toEqual({});
      post.flush(dispute({ status: 'Withdrawn', canPostMessage: false, canWithdraw: false, fundsOnHold: false, withdrawnAtUtc: '2026-10-21T01:00:00Z' }));
      await settle(harness);
      httpMock.expectOne(URL).flush(dispute({ status: 'Withdrawn', canPostMessage: false, canWithdraw: false, fundsOnHold: false, withdrawnAtUtc: '2026-10-21T01:00:00Z' }));
      await settle(harness);

      expect(textOf(root())).toContain('You withdrew this report on 21 Oct 2026 08:00.');
      expect(root().querySelector('[role="dialog"]')).toBeNull();
    });

    it('can be dropped without sending anything', async () => {
      await open(dispute());

      buttonByText(root(), 'Withdraw report')?.click();
      await settle(harness);
      buttonByText(root(), 'Keep the report open')?.click();
      await settle(harness);

      httpMock.expectNone(`${URL}/withdraw`);
      expect(root().querySelector('[role="dialog"]')).toBeNull();
    });

    it.each([
      ['other_party_posted', 'The other side has already answered'],
      ['behavior', 'Reports about behaviour cannot be withdrawn.'],
      ['not_opener', 'Only the person who opened this report can withdraw it.'],
    ] as const)('says why it cannot be withdrawn (%s) instead of hiding the section', async (withdrawBlockedReason, sentence) => {
      await open(dispute({ canWithdraw: false, withdrawBlockedReason }));

      expect(textOf(root())).toContain(sentence);
      expect(buttonByText(root(), 'Withdraw report')).toBeNull();
    });

    it('shows the server refusal inside the dialog and keeps it open', async () => {
      await open(dispute());

      buttonByText(root(), 'Withdraw report')?.click();
      await settle(harness);
      exactButton(root(), 'Withdraw')?.click();
      await settle(harness);
      httpMock
        .expectOne(`${URL}/withdraw`)
        .flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.dispute_withdraw_not_allowed' }, { status: 409, statusText: 'Conflict' });
      await settle(harness);

      expect(root().querySelector('[role="dialog"]')?.textContent).toContain('This report can no longer be withdrawn.');
    });
  });

  describe('keeping the thread fresh', () => {
    it('reads an open case again every half minute while the page is visible', async () => {
      vi.useFakeTimers();
      try {
        await open(dispute());

        vi.advanceTimersByTime(30_500);
        await settle(harness);

        httpMock.expectOne(URL).flush(dispute());
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops reading a case that is decided', async () => {
      vi.useFakeTimers();
      try {
        await open(dispute({ status: 'Resolved', canPostMessage: false, canWithdraw: false }));

        vi.advanceTimersByTime(65_000);
        await settle(harness);

        httpMock.expectNone(URL);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
