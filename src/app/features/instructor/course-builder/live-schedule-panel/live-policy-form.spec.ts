import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { LivePolicyForm } from './live-policy-form';

const POLICY_URL = '/api/catalog/instructor/courses/c1/enrollment-policy';

describe('LivePolicyForm', () => {
  let fixture: ComponentFixture<LivePolicyForm>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LivePolicyForm);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const root = () => fixture.nativeElement as HTMLElement;
  const field = (label: string): HTMLInputElement => {
    const match = Array.from(root().querySelectorAll('label')).find((l) => l.textContent?.includes(label)) as HTMLLabelElement;
    return root().querySelector(`#${match.getAttribute('for')}`) as HTMLInputElement;
  };
  const type = (label: string, value: string) => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    (root().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };

  it('shows what the server has: the deadline in Bangkok time, the seat cap and the seats already used', () => {
    fixture.componentRef.setInput('deadlineUtc', '2026-10-07T16:30:00Z'); // 23:30 Bangkok
    fixture.componentRef.setInput('maxSeats', 40);
    fixture.componentRef.setInput('seatsUsed', 12);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(field('Enrollment closes on').value).toBe('2026-10-07');
    expect(field('Closing time').value).toBe('23:30');
    expect(field('Maximum seats').value).toBe('40');
    expect(root().textContent).toContain('12 seat(s) used');
  });

  it('sends the Bangkok deadline as a UTC instant ending in Z, and the seat cap as a number', () => {
    type('Enrollment closes on', '2026-10-20');
    type('Closing time', '23:59');
    type('Maximum seats', '30');
    submit();

    const req = httpMock.expectOne(POLICY_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ enrollmentDeadlineUtc: '2026-10-20T16:59:00Z', maxSeats: 30 });
    req.flush({ id: 'c1', enrollmentDeadlineUtc: '2026-10-20T16:59:00Z', maxSeats: 30, seatsUsed: 0 });
  });

  it('empty fields mean "no deadline" / "no cap" and are sent as null', () => {
    submit();
    const req = httpMock.expectOne(POLICY_URL);
    expect(req.request.body).toEqual({ enrollmentDeadlineUtc: null, maxSeats: null });
    req.flush({ id: 'c1', enrollmentDeadlineUtc: null, maxSeats: null, seatsUsed: 0 });
  });

  it('refuses a half-filled deadline and a non-positive or fractional seat count, without calling the API', () => {
    type('Enrollment closes on', '2026-10-20');
    submit();
    httpMock.expectNone(POLICY_URL);
    expect(root().textContent).toContain('both the date and the time');

    type('Closing time', '10:00');
    type('Maximum seats', '0');
    submit();
    httpMock.expectNone(POLICY_URL);
    expect(root().textContent).toContain('whole number of 1 or more');

    type('Maximum seats', '2.5');
    submit();
    httpMock.expectNone(POLICY_URL);
  });

  it('explains a server 400 and does not lose what was typed', () => {
    type('Maximum seats', '5');
    submit();
    httpMock.expectOne(POLICY_URL).flush({ title: 'bad' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(root().textContent).toContain('Invalid values');
    expect(field('Maximum seats').value).toBe('5');
  });
});
