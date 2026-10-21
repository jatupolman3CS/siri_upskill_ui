import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminDisputeDetail } from '../../data/admin-dispute.models';
import { disputeDetail } from '../../testing/fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, typeInto, useEnglish } from '../../testing/spec-helpers';
import { DisputeCompensationDialog } from './dispute-compensation-dialog';

const URL_PATH = '/api/tutoring/admin/disputes/d-1/compensation-settled';

describe('DisputeCompensationDialog', () => {
  let fixture: ComponentFixture<DisputeCompensationDialog>;
  let httpMock: HttpTestingController;
  let settled: AdminDisputeDetail[];

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const confirm = (): HTMLButtonElement => root().querySelector('[role="dialog"] app-button:last-child button') as HTMLButtonElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DisputeCompensationDialog);
    settled = [];
    fixture.componentInstance.settled.subscribe((detail) => settled.push(detail));
    fixture.componentRef.setInput('disputeId', 'd-1');
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
  });

  afterEach(() => httpMock.verify());

  it('states that the system pays nothing itself', () => {
    expect(textOf(root())).toContain('The system does not pay compensation itself.');
  });

  it('needs a note and sends nothing without one', async () => {
    confirm().click();
    await settle(fixture);
    httpMock.expectNone(URL_PATH);
    expect(textOf(root())).toContain('This field is required.');
  });

  it('records the note and reports the case back', async () => {
    typeInto(root().querySelector('textarea'), '  Paid by bank transfer  ');
    await settle(fixture);
    confirm().click();
    const request = httpMock.expectOne(URL_PATH);
    expect(request.request.body).toEqual({ note: 'Paid by bank transfer' });
    request.flush(disputeDetail({ compensationSettled: true }));
    await settle(fixture);
    expect(settled).toHaveLength(1);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the server\'s refusal when there is nothing to close', async () => {
    typeInto(root().querySelector('textarea'), 'Paid');
    await settle(fixture);
    confirm().click();
    httpMock.expectOne(URL_PATH).flush(problemBody(409, 'tutoring.dispute_no_compensation_required', 'conflict'), { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(textOf(root())).toContain('This case has no compensation to close.');
    expect(settled).toHaveLength(0);
  });
});
