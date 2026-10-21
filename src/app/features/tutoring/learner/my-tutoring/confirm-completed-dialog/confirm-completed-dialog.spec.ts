import { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { ConfirmCompletedDialog } from './confirm-completed-dialog';

@Component({
  imports: [ConfirmCompletedDialog],
  template: `<app-confirm-completed-dialog [(open)]="open" bookingId="b-1" [disputeWindowEndsAtUtc]="until" (confirmed)="confirmed.set(confirmed() + 1)" />`,
})
class Host {
  readonly open = signal(false);
  readonly confirmed = signal(0);
  until: string | null = '2026-10-21T12:00:00Z';
}

const CONFIRM = '/api/tutoring/bookings/b-1/confirm-completed';

describe('ConfirmCompletedDialog', () => {
  let fixture: ComponentFixture<Host>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host], providers: [...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.open.set(true);
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('explains before it asks: the tutor is paid now, it cannot be undone, and a problem is reported instead', () => {
    const text = textOf(root());

    expect(text).toContain('The payment is then released to the tutor now');
    expect(text).toContain('Do not confirm if something went wrong');
    expect(text).toContain('cannot be undone');
  });

  it('says until when a problem can still be reported', () => {
    expect(textOf(root())).toContain('You can still report a problem until 21 Oct 2026 19:00');
  });

  it('confirms with an empty POST and tells the learner it is done', async () => {
    buttonByText(root(), 'Yes, confirm')?.click();
    await settle(fixture);

    const request = httpMock.expectOne(CONFIRM);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ bookingId: 'b-1', status: 'Completed', confirmedAtUtc: '2026-10-20T12:10:00Z' });
    await settle(fixture);

    expect(textOf(root())).toContain('Thank you. The payment is being released to the tutor.');
    expect(fixture.componentInstance.confirmed()).toBe(1);
  });

  it('cannot be sent twice while the request is in flight', async () => {
    const button = buttonByText(root(), 'Yes, confirm');
    button?.click();
    button?.click();
    await settle(fixture);

    httpMock.expectOne(CONFIRM).flush({ bookingId: 'b-1', status: 'Completed', confirmedAtUtc: 'x' });
  });

  it('shows the server refusal as it was given and stays open for another look', async () => {
    buttonByText(root(), 'Yes, confirm')?.click();
    await settle(fixture);
    httpMock.expectOne(CONFIRM).flush({ title: 'Conflict', status: 409, errorCode: 'conflict', reason: 'tutoring.confirm_not_available' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    expect(textOf(root())).toContain('This lesson cannot be confirmed right now.');
    expect(fixture.componentInstance.confirmed()).toBe(0);
    expect(buttonByText(root(), 'Yes, confirm')).not.toBeNull();
  });

  it('closes without calling anything on "Not yet"', async () => {
    buttonByText(root(), 'Not yet')?.click();
    await settle(fixture);

    expect(fixture.componentInstance.open()).toBe(false);
    httpMock.expectNone(CONFIRM);
  });
});
