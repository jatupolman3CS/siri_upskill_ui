import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { LiveSession } from '../../../live/data/live-instructor.models';
import { LiveSessionForm } from './live-session-form';

const CREATE_URL = '/api/catalog/instructor/courses/c1/live-sessions';

const existing: LiveSession = {
  id: 's1',
  courseId: 'c1',
  title: 'Session 1',
  description: 'About pivots',
  startsAtUtc: '2026-10-08T03:00:00Z', // 10:00 Bangkok
  endsAtUtc: '2026-10-08T05:30:00Z', // 12:30 Bangkok
  sortOrder: 0,
  status: 'Scheduled',
  cancelReason: null,
  recordingEpisodeId: null,
};

describe('LiveSessionForm', () => {
  let fixture: ComponentFixture<LiveSessionForm>;
  let httpMock: HttpTestingController;
  let saved: LiveSession[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LiveSessionForm);
    fixture.componentRef.setInput('courseId', 'c1');
    saved = [];
    fixture.componentInstance.saved.subscribe((s) => saved.push(s));
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const root = () => fixture.nativeElement as HTMLElement;
  const field = (label: string): HTMLInputElement => {
    const labels = Array.from(root().querySelectorAll('label'));
    const match = labels.find((l) => l.textContent?.includes(label)) as HTMLLabelElement;
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
  const fill = (title: string, date: string, start: string, end: string) => {
    type('Session title', title);
    type('Date', date);
    type('Start time', start);
    type('End time', end);
  };

  it('converts the Bangkok date/times the instructor typed into UTC instants ending in Z — never an offset', () => {
    fill('Excel basics', '2026-10-08', '10:00', '12:00');
    submit();

    const req = httpMock.expectOne(CREATE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      title: 'Excel basics',
      description: null,
      startsAtUtc: '2026-10-08T03:00:00Z',
      endsAtUtc: '2026-10-08T05:00:00Z',
    });
    expect(JSON.stringify(req.request.body)).not.toContain('+07');
    req.flush({ ...existing, id: 'new' });
    expect(saved.length).toBe(1);
  });

  it('a session that runs past Bangkok midnight ends on the next day (22:00 -> 01:00)', () => {
    fill('Late session', '2026-10-08', '22:00', '01:00');
    submit();

    const req = httpMock.expectOne(CREATE_URL);
    expect(req.request.body.startsAtUtc).toBe('2026-10-08T15:00:00Z');
    expect(req.request.body.endsAtUtc).toBe('2026-10-08T18:00:00Z');
    req.flush(existing);
  });

  it('a start before 07:00 Bangkok rolls the UTC date back', () => {
    fill('Early', '2026-10-08', '06:00', '08:00');
    submit();
    const req = httpMock.expectOne(CREATE_URL);
    expect(req.request.body.startsAtUtc).toBe('2026-10-07T23:00:00Z');
    req.flush(existing);
  });

  it('requires the title and the three time fields, and sends nothing while they are empty', () => {
    submit();
    httpMock.expectNone(CREATE_URL);
    expect(root().querySelectorAll('[role="alert"]').length).toBeGreaterThanOrEqual(4);
  });

  it('rejects a session shorter than 15 minutes or longer than 8 hours before calling the API', () => {
    fill('Too short', '2026-10-08', '10:00', '10:10');
    submit();
    httpMock.expectNone(CREATE_URL);
    expect(root().textContent).toContain('15 minutes to 8 hours');

    type('End time', '19:00'); // 9 h
    submit();
    httpMock.expectNone(CREATE_URL);
    expect(root().textContent).toContain('15 minutes to 8 hours');
  });

  it('explains a plain 400 as a bad time range and a plain 409 as an overlap, keeping what was typed', () => {
    fill('Excel basics', '2026-10-08', '10:00', '12:00');
    submit();
    httpMock.expectOne(CREATE_URL).flush({ title: 'bad' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(root().textContent).toContain('Invalid time range');

    submit();
    httpMock.expectOne(CREATE_URL).flush({ title: 'overlap' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(root().textContent).toContain('overlaps another session');
    expect(field('Session title').value).toBe('Excel basics');
  });

  it('guards against double submit', () => {
    fill('Excel basics', '2026-10-08', '10:00', '12:00');
    submit();
    submit();
    httpMock.expectOne(CREATE_URL).flush(existing);
    httpMock.expectNone(CREATE_URL);
  });

  it('editing pre-fills the Bangkok wall-clock values from the stored UTC instants and PUTs the change', () => {
    fixture.componentRef.setInput('session', existing);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(field('Session title').value).toBe('Session 1');
    expect(field('Date').value).toBe('2026-10-08');
    expect(field('Start time').value).toBe('10:00');
    expect(field('End time').value).toBe('12:30');
    expect(root().textContent).toContain('Edit live session');

    type('End time', '13:00');
    submit();
    const req = httpMock.expectOne(`${CREATE_URL}/s1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.endsAtUtc).toBe('2026-10-08T06:00:00Z');
    req.flush(existing);
  });
});
