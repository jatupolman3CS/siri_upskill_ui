import { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../../learner/testing/spec-helpers';
import { TutorOpenDisputeDialog } from './tutor-open-dispute-dialog';

@Component({ imports: [TutorOpenDisputeDialog], template: `<app-tutor-open-dispute-dialog [(open)]="open" bookingId="b-1" />` })
class Host {
  readonly open = signal(false);
}

@Component({ template: '' })
class RouteStub {}

const STATE_URL = '/api/tutoring/tutor/bookings/b-1/dispute';

describe('TutorOpenDisputeDialog', () => {
  let fixture: ComponentFixture<Host>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([{ path: 'instructor/tutoring/disputes/:id', component: RouteStub }]), ...HTTP_TEST_PROVIDERS],
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
    httpMock.expectOne(STATE_URL).flush(body);
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

  it('queries tutor dispute state when opened and shows refusal if canOpen is false', async () => {
    await openWith({
      bookingId: 'b-1',
      canOpen: false,
      reasonCode: 'window_closed',
      flow: null,
      allowedCategories: [],
      windowEndsAtUtc: null,
      dispute: null,
      fundsWillBeHeld: false,
      serverTimeUtc: '2026-10-19T10:00:00Z',
    });

    expect(textOf(root())).toContain('The time to report a problem with this lesson has passed');
  });

  it('shows existing dispute link if canOpen is false and dispute exists', async () => {
    await openWith({
      bookingId: 'b-1',
      canOpen: false,
      reasonCode: 'already_open',
      flow: null,
      allowedCategories: [],
      windowEndsAtUtc: null,
      dispute: { disputeId: 'd-existing', disputeNo: 'DP-2026-001', status: 'Open' },
      fundsWillBeHeld: false,
      serverTimeUtc: '2026-10-19T10:00:00Z',
    });

    const link = root().querySelector('a[href="/instructor/tutoring/disputes/d-existing"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(textOf(link!)).toContain('DP-2026-001');
  });

  it('renders open form, posts dispute with clientRequestId, and navigates on success', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate');

    await openWith({
      bookingId: 'b-1',
      canOpen: true,
      reasonCode: null,
      flow: 'Escrow',
      allowedCategories: ['Behavior', 'Other'],
      windowEndsAtUtc: '2026-10-20T10:00:00Z',
      dispute: null,
      fundsWillBeHeld: true,
      serverTimeUtc: '2026-10-19T10:00:00Z',
    });

    expect(textOf(root())).toContain('Note: Opening a dispute will hold payment for this class during review');

    choose('Behavior');
    type('textarea', 'The learner did not follow class rules.');
    await settle(fixture);

    const submitBtn = buttonByText(root(), 'Submit report');
    expect(submitBtn).not.toBeNull();
    submitBtn!.click();
    await settle(fixture);

    const postReq = httpMock.expectOne(STATE_URL);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toMatchObject({
      category: 'Behavior',
      description: 'The learner did not follow class rules.',
    });
    expect(postReq.request.body.clientRequestId).toBeDefined();

    postReq.flush(
      {
        disputeId: 'd-created',
        disputeNo: 'DP-2026-100',
        status: 'Open',
      },
      { status: 201, statusText: 'Created' },
    );
    await settle(fixture);

    expect(navigateSpy).toHaveBeenCalledWith(['/instructor/tutoring/disputes', 'd-created']);
    expect(fixture.componentInstance.open()).toBe(false);
  });
});
