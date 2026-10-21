import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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

  async function render(inputs: {
    slug?: string;
    offerings?: ReturnType<typeof tutorOffering>[];
    listed?: boolean;
    allowedDurationMinutes?: readonly number[];
  } = {}): Promise<HTMLElement> {
    fixture.componentRef.setInput('slug', inputs.slug ?? 'teacher-siri');
    fixture.componentRef.setInput('offerings', inputs.offerings ?? [tutorOffering()]);
    fixture.componentRef.setInput('listed', inputs.listed ?? true);
    if (inputs.allowedDurationMinutes !== undefined) {
      fixture.componentRef.setInput('allowedDurationMinutes', inputs.allowedDurationMinutes);
    }
    await settleWith(fixture, httpMock, [SLOTS_ROUTE]);
    return fixture.nativeElement as HTMLElement;
  }

  it('renders default durations (30, 60, 90, 120) when allowedDurationMinutes is not provided', async () => {
    const root = await render();
    const options = Array.from(root.querySelectorAll('option')).map((o) => o.textContent?.trim());

    expect(options).toContain('30 min');
    expect(options).toContain('60 min');
    expect(options).toContain('90 min');
    expect(options).toContain('120 min');
  });

  it('renders custom durations when allowedDurationMinutes input is provided', async () => {
    const root = await render({ allowedDurationMinutes: [45, 90] });
    const options = Array.from(root.querySelectorAll('option')).map((o) => o.textContent?.trim());

    expect(options).toContain('45 min');
    expect(options).toContain('90 min');
    expect(options).not.toContain('30 min');
    expect(options).not.toContain('60 min');
  });

  it('adjusts duration control value to the first allowed duration if initial value is not in allowed list', async () => {
    await render({ allowedDurationMinutes: [45, 90] });
    expect(component['durationControl'].value).toBe('45');
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
