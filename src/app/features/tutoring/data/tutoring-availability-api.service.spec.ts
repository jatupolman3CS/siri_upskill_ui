import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError, errorInterceptor } from '../../../core/http/error.interceptor';
import type { TutorAvailability } from './tutoring-availability.models';
import { TutoringAvailabilityApiService } from './tutoring-availability-api.service';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from './tutoring-errors';

const BASE = '/api/tutoring/tutor/availability';

const AVAILABILITY: TutorAvailability = {
  timezone: 'Asia/Bangkok',
  settings: { minNoticeHours: 24, bufferMinutes: 10, maxAdvanceDays: 60, rowVersion: 'AAAAAAAAB9E=' },
  rules: [{ dayOfWeek: 1, startLocal: '09:00', endLocal: '12:00' }],
  maxRules: 50,
};

describe('TutoringAvailabilityApiService', () => {
  let service: TutoringAvailabilityApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // withFetch() + the real error interceptor: matches app.config.ts, not the plain XHR default.
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(TutoringAvailabilityApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the whole availability from GET /tutoring/tutor/availability', () => {
    const received = vi.fn();
    service.getAvailability().subscribe(received);
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush(AVAILABILITY);
    expect(received).toHaveBeenCalledWith(AVAILABILITY);
  });

  it('saves the booking rules with the row version, to PUT /settings', () => {
    const body = { minNoticeHours: 12, bufferMinutes: 15, maxAdvanceDays: 90, rowVersion: 'AAAAAAAAB9E=' };
    const received = vi.fn();
    service.saveSettings(body).subscribe(received);
    const req = httpMock.expectOne(`${BASE}/settings`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({ ...body, rowVersion: 'AAAAAAAAB9I=' });
    expect(received).toHaveBeenCalledWith({ ...body, rowVersion: 'AAAAAAAAB9I=' });
  });

  it('replaces the whole weekly set with PUT /rules and gets the full availability back', () => {
    const received = vi.fn();
    service.replaceRules({ rules: AVAILABILITY.rules }).subscribe(received);
    const req = httpMock.expectOne(`${BASE}/rules`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ rules: AVAILABILITY.rules });
    req.flush(AVAILABILITY);
    expect(received).toHaveBeenCalledWith(AVAILABILITY);
  });

  it('pages the exceptions with page and pageSize', () => {
    service.listExceptions(2).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/exceptions`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 10, totalPages: 0 });
  });

  it('creates an exception and deletes one by its id (encoded)', () => {
    const body = { dateLocal: '2026-11-03', kind: 'Closed' as const, startLocal: null, endLocal: null, note: null };
    service.addException(body).subscribe();
    const create = httpMock.expectOne(`${BASE}/exceptions`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(body);
    create.flush({ exceptionId: 'e/1', ...body });

    service.deleteException('e/1').subscribe();
    const remove = httpMock.expectOne(`${BASE}/exceptions/e%2F1`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('carries the index and violation of a rejected rule (the C# keys, not "detail")', () => {
    let caught: unknown;
    service.replaceRules({ rules: [] }).subscribe({ error: (error: unknown) => (caught = error) });
    httpMock.expectOne(`${BASE}/rules`).flush(
      { status: 400, errorCode: 'validation', reason: 'tutoring.availability_rule_invalid', index: 2, violation: 'overlap' },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(caught).toBeInstanceOf(ApiError);
    expect(tutoringReasonOf(caught)).toBe('tutoring.availability_rule_invalid');
    expect(tutoringProblemOf(caught)?.index).toBe(2);
    expect(tutoringProblemOf(caught)?.violation).toBe('overlap');
    expect(tutoringErrorKey(caught)).toBe('tutoring.errors.availabilityRuleInvalid');
  });
});
