import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminKycCaseDetail } from '../../data/admin-kyc.models';
import { kycCase, kycDocument } from '../../testing/fixtures';
import { HTTP_TEST_PROVIDERS, controlByText, problemBody, settle, textOf, typeInto, useEnglish } from '../../testing/spec-helpers';
import type { VerdictMap } from '../kyc-case.util';
import { KycDecisionPanel } from './kyc-decision-panel';

const DECIDE = '/api/tutoring/admin/kyc/cases/case-1/decision';

describe('KycDecisionPanel', () => {
  let fixture: ComponentFixture<KycDecisionPanel>;
  let httpMock: HttpTestingController;
  let updated: AdminKycCaseDetail[];
  let stale: string[];

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function render(detail = kycCase(), verdicts: VerdictMap = {}): Promise<void> {
    fixture.componentRef.setInput('detail', detail);
    fixture.componentRef.setInput('verdicts', verdicts);
    await settle(fixture);
  }

  async function choose(option: string): Promise<void> {
    const labels = Array.from(root().querySelectorAll('input[name="kyc-decision"]')).map((input) => input.closest('label') as HTMLLabelElement);
    (labels.find((label) => label.textContent?.includes(option))?.querySelector('input') as HTMLInputElement).click();
    await settle(fixture);
  }

  const reviewButton = (): HTMLButtonElement => controlByText(root(), 'Review before confirming') as HTMLButtonElement;
  const confirmButton = (): HTMLButtonElement => root().querySelector('[role="dialog"] app-button:last-child button') as HTMLButtonElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(KycDecisionPanel);
    updated = [];
    stale = [];
    fixture.componentInstance.updated.subscribe((detail) => updated.push(detail));
    fixture.componentInstance.stale.subscribe((text) => stale.push(text));
  });

  afterEach(() => httpMock.verify());

  it('preselects nothing - an approval has to be a deliberate choice', async () => {
    await render();
    expect(root().querySelectorAll('input[name="kyc-decision"]:checked')).toHaveLength(0);
    expect(reviewButton().disabled).toBe(true);
  });

  it('tells the reviewer the applicant will read the note', async () => {
    await render();
    expect(textOf(root())).toContain('The applicant will see this text.');
  });

  it('explains a case that cannot be decided instead of showing the form', async () => {
    await render(kycCase({ status: 'Approved' }));
    expect(textOf(root())).toContain('cannot be decided now');
    expect(root().querySelector('input[name="kyc-decision"]')).toBeNull();
  });

  it('holds an approval back until every pending document has a verdict', async () => {
    await render(kycCase(), { 'doc-1': 'Approved' });
    await choose('Approve');
    expect(textOf(root())).toContain('Give a verdict to the 1 pending document');
    expect(reviewButton().disabled).toBe(true);
  });

  it('needs a note to reject, shown at the field, and opens no confirmation without it', async () => {
    await render();
    await choose('Reject');
    reviewButton().click();
    await settle(fixture);
    expect(textOf(root())).toContain('Please give a reason.');
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('says in plain words what rejecting does before anything is sent, then sends the row version and the verdicts', async () => {
    await render(kycCase(), { 'doc-1': 'Rejected', 'doc-2': 'Approved' });
    await choose('Reject');
    typeInto(root().querySelector('textarea'), 'The ID photo is unreadable.');
    await settle(fixture);
    reviewButton().click();
    await settle(fixture);

    const dialog = root().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Reject Khun Somchai for the reason below.');
    expect(dialog.textContent).toContain('All files will be deleted after the retention period');
    expect(dialog.textContent).toContain('The ID photo is unreadable.');
    httpMock.expectNone(DECIDE);

    confirmButton().click();
    const request = httpMock.expectOne(DECIDE);
    expect(request.request.body).toEqual({
      decision: 'Reject',
      note: 'The ID photo is unreadable.',
      documents: [
        { documentId: 'doc-1', status: 'Rejected' },
        { documentId: 'doc-2', status: 'Approved' },
      ],
      rowVersion: 'AAAAAAAAB9E=',
    });
    request.flush(kycCase({ status: 'Rejected' }));
    await settle(fixture);
    expect(updated.map((detail) => detail.status)).toEqual(['Rejected']);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('cannot be double-submitted: a second press while the request is in flight sends nothing', async () => {
    await render(kycCase(), { 'doc-1': 'Approved', 'doc-2': 'Approved' });
    await choose('Approve');
    reviewButton().click();
    await settle(fixture);
    confirmButton().click();
    await settle(fixture);
    confirmButton().click();
    httpMock.expectOne(DECIDE).flush(kycCase({ status: 'Approved' }));
    expect(updated).toHaveLength(1);
  });

  it('keeps an approval note optional and sends null when there is none', async () => {
    await render(kycCase(), { 'doc-1': 'Approved', 'doc-2': 'Approved' });
    await choose('Approve');
    reviewButton().click();
    await settle(fixture);
    confirmButton().click();
    const request = httpMock.expectOne(DECIDE);
    expect(request.request.body.note).toBeNull();
    request.flush(kycCase({ status: 'Approved' }));
  });

  it('names the document types that block an approval when the server says so', async () => {
    await render(kycCase(), { 'doc-1': 'Approved', 'doc-2': 'Approved' });
    await choose('Approve');
    reviewButton().click();
    await settle(fixture);
    confirmButton().click();
    httpMock.expectOne(DECIDE).flush(problemBody(400, 'tutoring.kyc.documents_undecided', 'validation', { types: ['Diploma'] }), { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    const dialog = root().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Every document needs a verdict');
    expect(dialog.textContent).toContain('Degree or diploma');
    expect(updated).toHaveLength(0);
  });

  it.each([
    ['a stale row version', 'tutoring.concurrent_update', 'conflict'],
    ['a case someone else decided', 'tutoring.kyc.case_already_decided', 'conflict'],
  ])('hands %s back to the page to reload', async (_label, reason, errorCode) => {
    await render(kycCase(), { 'doc-1': 'Approved', 'doc-2': 'Approved' });
    await choose('Approve');
    reviewButton().click();
    await settle(fixture);
    confirmButton().click();
    httpMock.expectOne(DECIDE).flush(problemBody(409, reason, errorCode), { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(stale).toHaveLength(1);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('starts the review of a submitted case and reports the case back', async () => {
    await render(kycCase({ status: 'Submitted', documents: [kycDocument()] }));
    (controlByText(root(), 'Start review') as HTMLButtonElement).click();
    httpMock.expectOne('/api/tutoring/admin/kyc/cases/case-1/start-review').flush(kycCase({ status: 'InReview' }));
    await settle(fixture);
    expect(updated.map((detail) => detail.status)).toEqual(['InReview']);
  });

  it('warns when the tutor is no longer waiting for verification', async () => {
    await render(kycCase({ tutorStatus: 'Suspended' }));
    expect(textOf(root())).toContain('no longer waiting for verification');
  });
});
