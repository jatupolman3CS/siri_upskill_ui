import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { refund } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { RefundStatus } from './refund-status';

describe('RefundStatus', () => {
  let fixture: ComponentFixture<RefundStatus>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [RefundStatus], providers: [...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RefundStatus);
    fixture.componentRef.setInput('bookingId', 'b-1');
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const REFUNDS = '/api/tutoring/bookings/b-1/refunds';

  it('says it is checking while the refunds load', () => {
    expect(root().querySelector('[role="status"]')?.textContent).toContain('Checking refund status');
    httpMock.expectOne(REFUNDS).flush([]);
  });

  it('shows nothing at all when the booking has no refund', async () => {
    httpMock.expectOne(REFUNDS).flush([]);
    await settle(fixture);

    expect(textOf(root()).trim()).toBe('');
  });

  it('reads a refund that is on its way as in progress and explains the PromptPay bank-details step in plain words', async () => {
    httpMock.expectOne(REFUNDS).flush([refund({ amount: 225, status: 'Processing', isAsync: true })]);
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('฿225.00');
    expect(text).toContain('Refund in progress');
    expect(text).toContain('Stripe will contact you by e-mail to ask for your bank account details');
  });

  it('does not mention bank details for a refund that is not asynchronous', async () => {
    httpMock.expectOne(REFUNDS).flush([refund({ status: 'Requested', isAsync: false })]);
    await settle(fixture);

    expect(textOf(root())).toContain('Refund in progress');
    expect(textOf(root())).not.toContain('bank account');
  });

  it('reads a finished refund as refunded, with the date and no bank-details note', async () => {
    httpMock.expectOne(REFUNDS).flush([refund({ status: 'Completed', completedAtUtc: '2026-10-18T04:00:00Z' })]);
    await settle(fixture);

    const text = textOf(root());
    expect(text).toContain('Refunded');
    expect(text).toContain('Refunded on 18 Oct 2026');
    expect(text).not.toContain('bank account');
  });

  it('tells the learner there is nothing to do when the refund failed, and never shows a provider code', async () => {
    httpMock.expectOne(REFUNDS).flush([refund({ status: 'Failed' })]);
    await settle(fixture);

    expect(textOf(root())).toContain('Our team is looking into this refund. There is nothing you need to do.');
  });

  it('lists every refund of the booking', async () => {
    httpMock.expectOne(REFUNDS).flush([refund({ refundId: 'r-1', amount: 100 }), refund({ refundId: 'r-2', amount: 50, status: 'Completed' })]);
    await settle(fixture);

    expect(root().querySelectorAll('ul > li')).toHaveLength(2);
  });

  it('shows an error with a retry that reads the refunds again', async () => {
    httpMock.expectOne(REFUNDS).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(textOf(root())).toContain('We could not load the refund status.');
    root().querySelector<HTMLButtonElement>('button')?.click();
    await settle(fixture);
    httpMock.expectOne(REFUNDS).flush([refund({ status: 'Completed' })]);
    await settle(fixture);

    expect(textOf(root())).toContain('Refunded');
  });

  it('keeps a button out of sight when nothing failed (no stray controls)', async () => {
    httpMock.expectOne(REFUNDS).flush([refund()]);
    await settle(fixture);

    expect(buttonByText(root(), 'Try again')).toBeNull();
    expect(root().querySelector('button')).toBeNull();
  });
});
