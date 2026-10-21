import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { CancelBookingResponse } from '../../../data/tutoring-my-bookings.models';
import { cancelled, quote } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { CancelBookingDialog } from './cancel-booking-dialog';

@Component({
  imports: [CancelBookingDialog],
  template: `<app-cancel-booking-dialog [(open)]="open" bookingId="b-1" [packageBooking]="packageBooking()" (cancelled)="done($event)" />`,
})
class Host {
  readonly open = signal(false);
  readonly packageBooking = signal(false);
  readonly results: CancelBookingResponse[] = [];
  done(result: CancelBookingResponse): void {
    this.results.push(result);
  }
}

const QUOTE = '/api/tutoring/bookings/b-1/cancellation-quote';
const POLICY = '/api/tutoring/cancellation-policy';
const CANCEL = '/api/tutoring/bookings/b-1/cancel';
const POLICY_BODY = {
  fullRefundHours: 24,
  fullRefundPercent: 100,
  lateRefundPercent: 50,
  tutorCancelRefundPercent: 100,
  tutorNoShowRefundPercent: 100,
  learnerNoShowRefundPercent: 0,
  disputeWindowHours: 24,
};

describe('CancelBookingDialog', () => {
  let fixture: ComponentFixture<Host>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host], providers: [...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /** Opens the dialog and answers the quote (and the policy, unless `policy` is false). */
  async function openWith(quoteBody: object, policy: object | false = POLICY_BODY): Promise<void> {
    fixture.componentInstance.open.set(true);
    await settle(fixture);
    httpMock.expectOne(QUOTE).flush(quoteBody);
    const policyRequest = httpMock.expectOne(POLICY);
    if (policy === false) {
      policyRequest.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    } else {
      policyRequest.flush(policy);
    }
    await settle(fixture);
  }

  function confirmRequest(): TestRequest {
    return httpMock.expectOne(CANCEL);
  }

  it('asks the server nothing while it is closed', () => {
    httpMock.expectNone(QUOTE);
    httpMock.expectNone(POLICY);
  });

  it('shows a busy skeleton while the quote is fetched', async () => {
    fixture.componentInstance.open.set(true);
    await settle(fixture);

    expect(root().querySelector('[role="status"][aria-label="Checking what cancelling means"]')).not.toBeNull();
    httpMock.expectOne(QUOTE).flush(quote());
    httpMock.expectOne(POLICY).flush(POLICY_BODY);
  });

  it('shows exactly the amounts the server quoted, the rule in plain words and the general policy', async () => {
    await openWith(quote({ amountPaid: 450, refundAmount: 225, retainedAmount: 225, refundPercent: 50, ruleCode: 'learner_cancel.late' }));

    const text = textOf(root());
    expect(text).toMatch(/You paid\s*฿450\.00/);
    expect(text).toMatch(/Refund to you\s*฿225\.00/);
    expect(text).toMatch(/Kept for the tutor's time\s*฿225\.00/);
    expect(text).toContain('50% of what you paid is refunded');
    expect(text).toContain('Our policy: cancel at least 24 hours before the lesson for a full refund; after that 50% is refunded.');
  });

  it('shows a full refund without a "kept" line', async () => {
    await openWith(quote());

    const text = textOf(root());
    expect(text).toContain('early enough for a full refund');
    expect(text).not.toContain('Kept for the tutor');
  });

  it('still works when the general policy cannot be loaded (it is context, the quote is what applies)', async () => {
    await openWith(quote(), false);

    expect(textOf(root())).toMatch(/Refund to you\s*฿450\.00/);
    expect(textOf(root())).not.toContain('Our policy');
  });

  it('says plainly that a PromptPay refund is paid back by bank transfer after Stripe e-mails', async () => {
    await openWith(quote({ refundIsAsync: true }));

    expect(textOf(root())).toContain('Stripe will contact you by e-mail to ask for your bank account details');
  });

  it('describes a package credit that will be restored instead of a money refund', async () => {
    await openWith(quote({ settlement: 'CreditRestore', refundIsAsync: false, refundAmount: 0, retainedAmount: 0 }));

    expect(textOf(root())).toContain('One credit of your lesson package will be restored.');
    expect(textOf(root())).not.toContain('bank account');
  });

  it('explains abandoning an unpaid booking without any money lines', async () => {
    await openWith(quote({ ruleCode: 'pending_payment.abandon', amountPaid: 0, refundAmount: 0, retainedAmount: 0, settlement: 'None', refundIsAsync: false }));

    expect(textOf(root())).toContain('not paid for yet');
    expect(root().querySelector('dl')).toBeNull();
  });

  it('explains a refusal and offers no way to confirm', async () => {
    await openWith(quote({ canCancel: false, refusalReason: 'after_start' }));

    expect(textOf(root())).toContain('The lesson has already started, so it cannot be cancelled.');
    expect(buttonByText(root(), 'Cancel the lesson')).toBeNull();
  });

  it('explains the prefixed `cancel_after_start` spelling of the same refusal in the same words', async () => {
    await openWith(quote({ canCancel: false, refusalReason: 'cancel_after_start' }));

    expect(textOf(root())).toContain('The lesson has already started, so it cannot be cancelled.');
    expect(buttonByText(root(), 'Cancel the lesson')).toBeNull();
  });

  it('explains a booking that is no longer open (`booking_not_cancellable`)', async () => {
    await openWith(quote({ canCancel: false, refusalReason: 'booking_not_cancellable' }));

    expect(textOf(root())).toContain('This booking can no longer be cancelled.');
    expect(buttonByText(root(), 'Cancel the lesson')).toBeNull();
  });

  it('shows an error with a retry when the quote cannot be loaded', async () => {
    fixture.componentInstance.open.set(true);
    await settle(fixture);
    httpMock.expectOne(QUOTE).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(POLICY).flush(POLICY_BODY);
    await settle(fixture);

    expect(textOf(root())).toContain('We could not check the cancellation terms');
    buttonByText(root(), 'Try again')?.click();
    await settle(fixture);
    httpMock.expectOne(QUOTE).flush(quote());
    await settle(fixture);

    expect(textOf(root())).toMatch(/Refund to you\s*฿450\.00/);
  });

  it('confirms with the refund the learner saw, sends no reason when none was written, and shows the receipt', async () => {
    await openWith(quote({ refundAmount: 225, retainedAmount: 225, refundPercent: 50, ruleCode: 'learner_cancel.late' }));

    buttonByText(root(), 'Cancel the lesson')?.click();
    await settle(fixture);
    const request = confirmRequest();
    expect(request.request.body).toEqual({ reason: null, expectedRefundAmount: 225 });
    request.flush(cancelled({ refundAmount: 225, retainedAmount: 225, refund: { refundId: 'r-1', amount: 225, status: 'Requested', isAsync: true, requestedAtUtc: 'x', completedAtUtc: null } }));
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('The lesson was cancelled.');
    expect(text).toMatch(/Refund to you\s*฿225\.00/);
    expect(text).toContain('Refund in progress');
    expect(text).toContain('Stripe will contact you by e-mail');
    expect(fixture.componentInstance.results).toHaveLength(1);
  });

  it('sends the written reason, trimmed', async () => {
    await openWith(quote());

    const textarea = root().querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '  I am ill  ';
    textarea.dispatchEvent(new Event('input'));
    buttonByText(root(), 'Cancel the lesson')?.click();
    await settle(fixture);

    const request = confirmRequest();
    expect(request.request.body).toEqual({ reason: 'I am ill', expectedRefundAmount: 450 });
    request.flush(cancelled());
  });

  it('cannot be confirmed twice: a second click while the request is in flight sends nothing', async () => {
    await openWith(quote());

    const button = buttonByText(root(), 'Cancel the lesson');
    button?.click();
    button?.click();
    await settle(fixture);

    const request = confirmRequest();
    request.flush(cancelled());
  });

  it('reports a repeated cancel as already done', async () => {
    await openWith(quote());

    buttonByText(root(), 'Cancel the lesson')?.click();
    await settle(fixture);
    confirmRequest().flush(cancelled({ alreadyCancelled: true }));
    await settle(fixture);

    expect(textOf(root())).toContain('This lesson was already cancelled.');
  });

  it('says a restored package credit needs nothing more', async () => {
    await openWith(quote({ settlement: 'CreditRestore', refundIsAsync: false }));

    buttonByText(root(), 'Cancel the lesson')?.click();
    await settle(fixture);
    confirmRequest().flush(cancelled({ settlement: 'CreditRestore', creditRestored: true, refund: null, refundAmount: 0 }));
    await settle(fixture);

    expect(textOf(root())).toContain('Your package credit was restored.');
  });

  it('when the free-cancellation moment passes while reading, shows the new amounts and needs a second, explicit confirmation', async () => {
    await openWith(quote({ refundAmount: 450, retainedAmount: 0 }));

    buttonByText(root(), 'Cancel the lesson')?.click();
    await settle(fixture);
    confirmRequest().flush(
      { title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.cancellation_quote_changed', refundAmount: 225, retainedAmount: 225 },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('The refund changed because the free-cancellation time has just passed');
    expect(text).toMatch(/Refund to you\s*฿225\.00/);
    expect(text).toMatch(/Kept for the tutor's time\s*฿225\.00/);
    expect(fixture.componentInstance.results).toHaveLength(0);

    buttonByText(root(), 'Confirm with the new amount')?.click();
    await settle(fixture);
    const second = confirmRequest();
    expect(second.request.body).toEqual({ reason: null, expectedRefundAmount: 225 });
    second.flush(cancelled({ refundAmount: 225, retainedAmount: 225 }));
  });

  it('shows the server refusal of a booking that can no longer be cancelled', async () => {
    await openWith(quote());

    buttonByText(root(), 'Cancel the lesson')?.click();
    await settle(fixture);
    confirmRequest().flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.booking_not_cancellable' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    expect(textOf(root())).toContain('This booking can no longer be cancelled.');
    expect(fixture.componentInstance.results).toHaveLength(0);
  });

  it('refuses a reason with markup before anything is sent', async () => {
    await openWith(quote());

    const textarea = root().querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '<b>hello</b>';
    textarea.dispatchEvent(new Event('input'));
    buttonByText(root(), 'Cancel the lesson')?.click();
    await settle(fixture);

    httpMock.expectNone(CANCEL);
    expect(textOf(root())).toContain('Remove angle brackets and HTML tags.');
  });

  it('does not close on a click outside it (a destructive action)', async () => {
    await openWith(quote());

    (root().querySelector('.app-modal-overlay') as HTMLElement).click();
    await settle(fixture);

    expect(fixture.componentInstance.open()).toBe(true);
  });

  describe('a lesson booked with a package credit', () => {
    beforeEach(() => fixture.componentInstance.packageBooking.set(true));

    it('says before confirming that cancelling this late uses the credit up, next to the refund the server quoted for the lesson share', async () => {
      await openWith(quote({ amountPaid: 405, refundAmount: 202.5, retainedAmount: 202.5, refundPercent: 50, ruleCode: 'learner_cancel.late', settlement: 'Money' }));

      const text = textOf(root());
      expect(text).toContain('This lesson used a package credit. Cancelling this late uses the credit up: it will not be returned.');
      expect(text).toMatch(/Refund to you\s*฿202\.50/);
      expect(text).not.toContain('One credit of your lesson package will be restored.');
    });

    it('keeps the "credit will be restored" wording when the server says it will be restored - and does not also say it is used up', async () => {
      await openWith(quote({ settlement: 'CreditRestore', refundIsAsync: false, refundAmount: 0, retainedAmount: 0 }));

      expect(textOf(root())).toContain('One credit of your lesson package will be restored.');
      expect(textOf(root())).not.toContain('uses the credit up');
    });

    it('tells the person after cancelling that the credit was not given back', async () => {
      await openWith(quote({ amountPaid: 405, refundAmount: 202.5, retainedAmount: 202.5, ruleCode: 'learner_cancel.late', settlement: 'Money' }));

      buttonByText(root(), 'Cancel the lesson')?.click();
      await settle(fixture);
      confirmRequest().flush(cancelled({ settlement: 'Money', creditRestored: false, refundAmount: 202.5, retainedAmount: 202.5 }));
      await settle(fixture);

      expect(textOf(root())).toContain('The package credit for this lesson has been used up and will not be returned.');
    });

    it('does not add that line when the credit was restored', async () => {
      await openWith(quote({ settlement: 'CreditRestore', refundIsAsync: false }));

      buttonByText(root(), 'Cancel the lesson')?.click();
      await settle(fixture);
      confirmRequest().flush(cancelled({ settlement: 'CreditRestore', creditRestored: true, refund: null, refundAmount: 0 }));
      await settle(fixture);

      expect(textOf(root())).toContain('Your package credit was restored.');
      expect(textOf(root())).not.toContain('used up');
    });
  });

  it('says nothing about a package credit for an ordinary lesson that is cancelled late', async () => {
    await openWith(quote({ amountPaid: 450, refundAmount: 225, retainedAmount: 225, ruleCode: 'learner_cancel.late' }));

    expect(textOf(root())).not.toContain('package credit');
  });
});
