import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, type TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { tutorOffering } from '../../testing/tutor-fixtures';
import { settleWith } from '../../testing/tutor-ops-fixtures';
import { AvailabilityPreview } from './availability-preview';

describe('AvailabilityPreview', () => {
  let fixture: ComponentFixture<AvailabilityPreview>;
  let component: AvailabilityPreview;
  let httpMock: HttpTestingController;
  let seen: TestRequest[];

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AvailabilityPreview],
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AvailabilityPreview);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  const SLOTS_ROUTE = {
    url: '/api/tutoring/tutors/teacher-siri/slots',
    reply: { slots: [], maxAdvanceDays: 60 },
  };

  const SERVER_LENGTHS = [45, 90];

  async function render(inputs: {
    slug?: string;
    offerings?: ReturnType<typeof tutorOffering>[];
    listed?: boolean;
    allowedDurationMinutes?: readonly number[];
    maxAdvanceDays?: number;
  } = {}): Promise<HTMLElement> {
    fixture.componentRef.setInput('slug', inputs.slug ?? 'teacher-siri');
    fixture.componentRef.setInput('offerings', inputs.offerings ?? [tutorOffering()]);
    fixture.componentRef.setInput('listed', inputs.listed ?? true);
    // The component has no list of its own: it must be handed the server's, so every case passes one.
    fixture.componentRef.setInput('allowedDurationMinutes', inputs.allowedDurationMinutes ?? SERVER_LENGTHS);
    // Same for the booking horizon: it comes from the availability settings the page holds, never from a number in the component.
    fixture.componentRef.setInput('maxAdvanceDays', inputs.maxAdvanceDays ?? 60);
    seen = await settleWith(fixture, httpMock, [SLOTS_ROUTE]);
    return fixture.nativeElement as HTMLElement;
  }

  const lengthOptions = (root: HTMLElement): string[] =>
    Array.from(root.querySelectorAll('option'))
      .map((o) => o.textContent?.trim() ?? '')
      .filter((text) => text.endsWith(' min'));

  it('offers exactly the class lengths the server lists, and no built-in 30 / 60 / 90 / 120', async () => {
    const root = await render({ allowedDurationMinutes: [45, 90] });

    expect(lengthOptions(root)).toEqual(['45 min', '90 min']);
  });

  it('follows whatever the server lists - a different list gives a different picker', async () => {
    const root = await render({ allowedDurationMinutes: [20, 40, 80] });

    expect(lengthOptions(root)).toEqual(['20 min', '40 min', '80 min']);
  });

  it('starts on the first allowed length and never asks the slot endpoint for a length the server did not list', async () => {
    await render({ allowedDurationMinutes: [45, 90] });

    expect(component['durationControl'].value).toBe('45');
    const asked = seen.map((request) => request.request.params.get('durationMinutes'));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((minutes) => minutes === '45')).toBe(true);
  });

  it('offers nothing and asks for nothing when the server lists no length', async () => {
    const root = await render({ allowedDurationMinutes: [] });

    expect(lengthOptions(root)).toEqual([]);
    expect(component['durationControl'].value).toBe('');
    expect(seen).toHaveLength(0);
  });

  const nextWeekButton = (root: HTMLElement): HTMLButtonElement =>
    root.querySelector<HTMLButtonElement>('button[aria-label="Next week"]') as HTMLButtonElement;

  it("pages the calendar only as far as the tutor's own booking horizon, from the first paint", async () => {
    // The slot answer carries a different horizon (60) than the settings (13): the settings are what the page holds before any answer
    // arrives, so they alone decide - there is no built-in number to fall back on.
    const root = await render({ maxAdvanceDays: 13 });

    expect(nextWeekButton(root).disabled).toBe(false);
    nextWeekButton(root).click();
    seen = await settleWith(fixture, httpMock, [SLOTS_ROUTE]);

    expect(nextWeekButton(root).disabled).toBe(true);
  });

  it('does not offer a next week when the horizon ends before the second week starts', async () => {
    const root = await render({ maxAdvanceDays: 6 });

    expect(nextWeekButton(root).disabled).toBe(true);
  });

  it('shows not-listed notice when listed is false', async () => {
    const root = await render({ listed: false });
    expect(root.textContent).toContain('Your profile is not listed publicly yet');
  });

  it('shows no-offering notice when offerings list is empty', async () => {
    const root = await render({ offerings: [] });
    expect(root.textContent).toContain('You have no active subject, so there is nothing to preview yet');
  });
});
