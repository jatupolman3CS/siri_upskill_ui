import { HttpTestingController } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminTutorDetail } from '../../data/admin-tutor.models';
import { tutorDetail } from '../../testing/fixtures';
import { HTTP_TEST_PROVIDERS, problemBody, settle, textOf, typeInto, useEnglish } from '../../testing/spec-helpers';
import type { ModerationMode } from '../tutor-moderation.util';
import { TutorModerationDialog } from './tutor-moderation-dialog';

const BASE = '/api/tutoring/admin/tutors/tutor-1';

describe('TutorModerationDialog', () => {
  let fixture: ComponentFixture<TutorModerationDialog>;
  let httpMock: HttpTestingController;
  let done: AdminTutorDetail[];

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const confirm = (): HTMLButtonElement => root().querySelector('[role="dialog"] app-button:last-child button') as HTMLButtonElement;

  async function open(mode: ModerationMode, tutor = tutorDetail()): Promise<void> {
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('tutor', tutor);
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...HTTP_TEST_PROVIDERS] });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TutorModerationDialog);
    done = [];
    fixture.componentInstance.done.subscribe((detail) => done.push(detail));
  });

  afterEach(() => httpMock.verify());

  it('says what suspending does before it is confirmed, and needs a reason', async () => {
    await open('suspend');
    const text = textOf(root());
    expect(text).toContain('Khun Somchai is hidden from search');
    expect(text).toContain('Classes still to come are cancelled');
    confirm().click();
    await settle(fixture);
    httpMock.expectNone(`${BASE}/suspend`);
    expect(textOf(root())).toContain('This field is required.');
  });

  it('suspends with the reason and reports the tutor as the server now has them', async () => {
    await open('suspend');
    typeInto(root().querySelector('textarea'), '  Repeated no-shows  ');
    await settle(fixture);
    confirm().click();
    const request = httpMock.expectOne(`${BASE}/suspend`);
    expect(request.request.body).toEqual({ reason: 'Repeated no-shows' });
    request.flush(tutorDetail({ status: 'Suspended' }));
    await settle(fixture);
    expect(done.map((detail) => detail.status)).toEqual(['Suspended']);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('cannot be submitted twice while the request is in flight', async () => {
    await open('suspend');
    typeInto(root().querySelector('textarea'), 'Reason');
    await settle(fixture);
    confirm().click();
    await settle(fixture);
    confirm().click();
    httpMock.expectOne(`${BASE}/suspend`).flush(tutorDetail({ status: 'Suspended' }));
    expect(done).toHaveLength(1);
  });

  it('keeps the dialog open with the server\'s reason when the tutor is not in a suspendable state', async () => {
    await open('suspend');
    typeInto(root().querySelector('textarea'), 'Reason');
    await settle(fixture);
    confirm().click();
    httpMock.expectOne(`${BASE}/suspend`).flush(problemBody(409, 'tutoring.invalid_transition', 'conflict'), { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(textOf(root())).toContain("The tutor's current state does not allow this");
    expect(done).toHaveLength(0);
  });

  it('reinstates without a reason (sending null) and says the tutor must reopen themselves', async () => {
    await open('reinstate', tutorDetail({ status: 'Suspended' }));
    expect(textOf(root())).toContain('stays out of search until the tutor reopens themselves');
    confirm().click();
    const request = httpMock.expectOne(`${BASE}/reinstate`);
    expect(request.request.body).toEqual({ reason: null });
    request.flush(tutorDetail());
  });

  it('shows the current commission and where it comes from, and sends a valid override', async () => {
    await open('commission');
    const text = textOf(root());
    expect(text).toContain('20%');
    expect(text).toContain('Platform default');
    typeInto(root().querySelector('input[inputmode="decimal"]'), '15.5');
    typeInto(root().querySelector('textarea'), 'Founding tutor');
    await settle(fixture);
    confirm().click();
    const request = httpMock.expectOne(`${BASE}/commission`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ commissionPercentOverride: 15.5, reason: 'Founding tutor' });
    request.flush(tutorDetail({ commissionPercentOverride: 15.5, effectiveCommissionPercent: 15.5 }));
  });

  it('refuses an out-of-range rate at the field without calling the API', async () => {
    await open('commission');
    typeInto(root().querySelector('input[inputmode="decimal"]'), '75');
    typeInto(root().querySelector('textarea'), 'Reason');
    await settle(fixture);
    confirm().click();
    await settle(fixture);
    httpMock.expectNone(`${BASE}/commission`);
    expect(textOf(root())).toContain('Enter a number from 0 to 50.');
    expect(root().querySelector('input[aria-invalid="true"]')).not.toBeNull();
  });

  it('clears the override with "use the default", hiding the number field', async () => {
    await open('commission', tutorDetail({ commissionPercentOverride: 15, effectiveCommissionPercent: 15 }));
    expect(textOf(root())).toContain('Set for this tutor');
    (root().querySelector('app-checkbox input') as HTMLInputElement).click();
    await settle(fixture);
    expect(root().querySelector('input[inputmode="decimal"]')).toBeNull();
    typeInto(root().querySelector('textarea'), 'Back to default');
    await settle(fixture);
    confirm().click();
    const request = httpMock.expectOne(`${BASE}/commission`);
    expect(request.request.body.commissionPercentOverride).toBeNull();
    request.flush(tutorDetail());
  });
});
