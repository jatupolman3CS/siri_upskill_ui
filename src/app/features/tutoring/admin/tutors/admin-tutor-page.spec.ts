import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import type { AdminTutorDetail } from '../data/admin-tutor.models';
import { tutorDetail } from '../testing/fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, problemBody, settle, textOf, typeInto, useEnglish } from '../testing/spec-helpers';
import { AdminTutorPage } from './admin-tutor-page';

@Component({ template: '' })
class RouteStub {}

const TUTOR = '/api/tutoring/admin/tutors/tutor-1';

describe('AdminTutorPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'admin/tutoring/tutors/:tutorId', component: AdminTutorPage }, { path: '**', component: RouteStub }]), ...HTTP_TEST_PROVIDERS],
    });
    useEnglish();
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function open(answer: AdminTutorDetail | { status: number; body: object } | 'pending'): Promise<void> {
    await harness.navigateByUrl('/admin/tutoring/tutors/tutor-1', AdminTutorPage);
    await settle(harness);
    if (answer === 'pending') {
      return;
    }
    const request = httpMock.expectOne(TUTOR);
    if ('status' in answer && 'body' in answer) {
      request.flush(answer.body, { status: answer.status, statusText: 'x' });
    } else {
      request.flush(answer);
    }
    await settle(harness);
  }

  it('shows a busy skeleton while loading', async () => {
    await open('pending');
    expect(root().querySelector('[role="status"][aria-label="Loading"]')).not.toBeNull();
    httpMock.expectOne(TUTOR).flush(tutorDetail());
  });

  it('shows the tutor: state, reason, performance, commission and what they teach', async () => {
    await open(tutorDetail({ status: 'Suspended', statusReason: 'Repeated no-shows', isListed: false, commissionPercentOverride: 15, effectiveCommissionPercent: 15 }));
    const text = textOf(root());
    expect(text).toContain('Khun Somchai');
    expect(text).toContain('Suspended');
    expect(text).toContain('Repeated no-shows');
    expect(text).toContain('Not listed');
    expect(text).toContain('Only the tutor turns this on or off');
    expect(text).toContain('Commission: 15%');
    expect(text).toContain('Set for this tutor');
    expect(text).toContain('Mathematics');
    expect(text).toContain('Chula');
    expect(text).toContain('Teaching licence');
    expect(root().querySelector('a[href^="/admin/tutoring/disputes?"]')?.getAttribute('href')).toContain('tutorId=tutor-1');
  });

  it('offers suspend only to a verified tutor and reinstate only to a suspended one', async () => {
    await open(tutorDetail({ status: 'Verified' }));
    expect(buttonByText(root(), 'Suspend tutor')).not.toBeNull();
    expect(buttonByText(root(), 'Reinstate')).toBeNull();
    expect(buttonByText(root(), 'Change commission')).not.toBeNull();
  });

  it('offers neither for a tutor who is waiting for verification, and says why', async () => {
    await open(tutorDetail({ status: 'PendingVerification' }));
    expect(buttonByText(root(), 'Suspend tutor')).toBeNull();
    expect(buttonByText(root(), 'Reinstate')).toBeNull();
    expect(textOf(root())).toContain('does not apply in this state');
  });

  it('suspends and then shows the tutor as the server returns them', async () => {
    await open(tutorDetail());
    (buttonByText(root(), 'Suspend tutor') as HTMLButtonElement).click();
    await settle(harness);
    typeInto(root().querySelector('[role="dialog"] textarea'), 'Complaints');
    await settle(harness);
    (root().querySelector('[role="dialog"] app-button:last-child button') as HTMLButtonElement).click();
    httpMock.expectOne(`${TUTOR}/suspend`).flush(tutorDetail({ status: 'Suspended', statusReason: 'Complaints', isListed: false }));
    await settle(harness);
    expect(textOf(root())).toContain('Complaints');
    expect(buttonByText(root(), 'Suspend tutor')).toBeNull();
    expect(buttonByText(root(), 'Reinstate')).not.toBeNull();
  });

  it('says the tutor does not exist for a 404', async () => {
    await open({ status: 404, body: problemBody(404, 'tutoring.tutor_not_found', 'not_found') });
    expect(textOf(root())).toContain('Tutor not found');
  });

  it('reports a failed load and retries', async () => {
    await open({ status: 500, body: { title: 'x' } });
    expect(textOf(root())).toContain('Could not load tutors');
    (buttonByText(root(), 'Try again') as HTMLButtonElement).click();
    await settle(harness);
    httpMock.expectOne(TUTOR).flush(tutorDetail());
  });
});
