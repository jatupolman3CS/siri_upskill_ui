import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { Booking } from '../../../data/tutoring-learner.models';
import { confirmedBooking } from '../../testing/learner-fixtures';
import { disputeState } from '../../testing/my-tutoring-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { DisputeSection } from './dispute-section';

describe('DisputeSection', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [DisputeSection], providers: [provideRouter([]), ...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function render(overrides: Partial<Booking>): Promise<{ fixture: ComponentFixture<DisputeSection>; root: HTMLElement }> {
    const fixture = TestBed.createComponent(DisputeSection);
    fixture.componentRef.setInput('booking', confirmedBooking({ status: 'Completed', ...overrides }));
    await settle(fixture);
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows nothing when the server offers no way to report a problem and there is no case', async () => {
    const { root } = await render({ disputeId: null, disputeWindowEndsAtUtc: null });

    expect(textOf(root).trim()).toBe('');
  });

  it('offers "Report a problem" with the end of the window when the server says one is open - and asks nothing until it is pressed', async () => {
    const { root } = await render({ disputeWindowEndsAtUtc: '2026-10-21T12:00:00Z' });

    expect(textOf(root)).toContain('you can report a problem until 21 Oct 2026 19:00');
    expect(buttonByText(root, 'Report a problem')).not.toBeNull();
    httpMock.expectNone('/api/tutoring/bookings/b-1/dispute');
  });

  it('opens the dialog, which asks the server whether a report can be opened', async () => {
    const { fixture, root } = await render({ disputeWindowEndsAtUtc: '2026-10-21T12:00:00Z' });

    buttonByText(root, 'Report a problem')?.click();
    await settle(fixture);
    httpMock.expectOne('/api/tutoring/bookings/b-1/dispute').flush(disputeState());
    await settle(fixture);

    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('links to the report that exists instead of offering a new one', async () => {
    const { root } = await render({ disputeId: 'd-3', disputeWindowEndsAtUtc: '2026-10-21T12:00:00Z' });

    expect(textOf(root)).toContain('A problem report already exists for this lesson.');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/my-tutoring/disputes/d-3');
    expect(buttonByText(root, 'Report a problem')).toBeNull();
  });
});
