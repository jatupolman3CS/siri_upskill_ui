import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError, errorInterceptor } from '../../../core/http/error.interceptor';
import { tutoringErrorKey, tutoringProblemOf, tutoringReasonOf } from './tutoring-errors';
import { TutoringClassesApiService } from './tutoring-classes-api.service';
import type { CompleteClassRequest } from './tutoring-classes.models';

const CLASS = '/api/tutoring/tutor/classes/s-1';
const SUMMARY: CompleteClassRequest = { topicsCovered: 'Quadratics', homework: null, nextSteps: null, learnerFeedback: [{ bookingId: 'b-1', feedback: 'Good' }] };

describe('TutoringClassesApiService', () => {
  let service: TutoringClassesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()] });
    service = TestBed.inject(TutoringClassesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists classes by scope with paging', () => {
    service.listClasses('history', 3, 10).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/classes');
    expect(req.request.params.get('scope')).toBe('history');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [], totalCount: 0, page: 3, pageSize: 10, totalPages: 0 });
  });

  it('hands the contract\'s list item through untouched: flags, learners with their booking status, the room without a URL, the server clock', () => {
    const item = {
      sessionId: 's-1',
      startsAtUtc: '2026-10-20T02:00:00Z',
      endsAtUtc: '2026-10-20T03:00:00Z',
      status: 'Scheduled',
      format: 'Group',
      isTrial: false,
      offering: { offeringId: 'off-1', subjectNameTh: 'ฟิสิกส์', subjectNameEn: 'Physics', level: 'UpperSecondary', curriculum: 'Thai' },
      learners: [{ nickname: 'Nok', gradeLevel: 'Secondary4', isMinor: true, bookingId: 'b-1', status: 'Confirmed' }],
      seatsTaken: 2,
      capacity: 4,
      startOpensAtUtc: '2026-10-20T01:45:00Z',
      canStart: true,
      completeOpensAtUtc: '2026-10-20T02:50:00Z',
      canComplete: false,
      learnerPresent: false,
      needsSummary: false,
      summaryEditableUntilUtc: null,
      room: { state: 'Ready', needsAction: 'None' },
      serverTimeUtc: '2026-10-20T01:50:00Z',
    };
    const received = vi.fn();
    service.listClasses('upcoming', 1, 10).subscribe(received);
    httpMock.expectOne((r) => r.url === '/api/tutoring/tutor/classes').flush({ items: [item], totalCount: 1, page: 1, pageSize: 10, totalPages: 1 });
    expect(received.mock.calls[0][0].items[0]).toEqual(item);
  });

  it('starts a class with POST /start (no id, role or time in the body) and returns the room link', () => {
    const received = vi.fn();
    service.startClass('s-1').subscribe(received);
    const req = httpMock.expectOne(`${CLASS}/start`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ sessionId: 's-1', role: 'Tutor', meetUrl: 'https://meet.google.com/abc-defg-hij', startsAtUtc: 'a', endsAtUtc: 'b', serverTimeUtc: 'c' });
    expect(received.mock.calls[0][0].meetUrl).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('keeps the opensAtUtc of a "window not open" refusal', () => {
    let caught: unknown;
    service.startClass('s-1').subscribe({ error: (error: unknown) => (caught = error) });
    httpMock.expectOne(`${CLASS}/start`).flush(
      { status: 409, reason: 'tutoring.window_not_open', opensAtUtc: '2026-10-20T01:50:00Z', serverTimeUtc: '2026-10-20T01:00:00Z' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(caught).toBeInstanceOf(ApiError);
    expect(tutoringReasonOf(caught)).toBe('tutoring.window_not_open');
    expect(tutoringProblemOf(caught)?.opensAtUtc).toBe('2026-10-20T01:50:00Z');
    expect(tutoringErrorKey(caught)).toBe('tutoring.errors.windowNotOpen');
  });

  it('completes with POST /complete and edits the summary with PUT /summary using the same body', () => {
    service.completeClass('s-1', SUMMARY).subscribe();
    const complete = httpMock.expectOne(`${CLASS}/complete`);
    expect(complete.request.method).toBe('POST');
    expect(complete.request.body).toEqual(SUMMARY);
    complete.flush({ sessionId: 's-1', status: 'Completed', alreadyCompleted: false, completedBookings: 1, noShowLearnerBookings: 0, pendingBookings: 0 });

    service.saveSummary('s-1', SUMMARY).subscribe();
    const save = httpMock.expectOne(`${CLASS}/summary`);
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual(SUMMARY);
    save.flush({});

    service.getSummary('s-1').subscribe();
    httpMock.expectOne(`${CLASS}/summary`).flush({ sessionId: 's-1', topicsCovered: null, homework: null, nextSteps: null, learners: [] });
  });

  it('reads attendance and the room, saves a pasted link and retries the room', () => {
    service.getAttendance('s-1').subscribe();
    httpMock.expectOne(`${CLASS}/attendance`).flush({});
    service.getRoom('s-1').subscribe();
    httpMock.expectOne(`${CLASS}/room`).flush({});

    service.setMeetingLink('s-1', 'https://meet.google.com/abc-defg-hij').subscribe();
    const link = httpMock.expectOne(`${CLASS}/meeting-link`);
    expect(link.request.method).toBe('PUT');
    expect(link.request.body).toEqual({ meetUrl: 'https://meet.google.com/abc-defg-hij' });
    link.flush({});

    service.retryRoom('s-1').subscribe();
    const retry = httpMock.expectOne(`${CLASS}/room/retry`);
    expect(retry.request.method).toBe('POST');
    retry.flush({});
  });

  it('reads materials through the participant route and writes them through the tutor route', () => {
    service.listMaterials('s-1').subscribe();
    httpMock.expectOne('/api/tutoring/sessions/s-1/materials').flush([]);

    const link = { kind: 'Link' as const, title: 'Notes', url: 'https://example.com/n', bodyText: null };
    service.addMaterial('s-1', link).subscribe();
    const add = httpMock.expectOne(`${CLASS}/materials`);
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual(link);
    add.flush({});

    service.removeMaterial('s-1', 'm-1').subscribe();
    const remove = httpMock.expectOne(`${CLASS}/materials/m-1`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });

    service.getMaterialDownload('s-1', 'm-1').subscribe();
    httpMock.expectOne('/api/tutoring/sessions/s-1/materials/m-1/download').flush({});
  });

  it('uploads a material file as multipart with the file part and an optional title', () => {
    service.uploadMaterialFile('s-1', new File(['x'], 'worksheet.pdf', { type: 'application/pdf' }), 'Worksheet').subscribe();
    const req = httpMock.expectOne(`${CLASS}/materials`);
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    expect(body.get('title')).toBe('Worksheet');
    expect((body.get('file') as File).name).toBe('worksheet.pdf');
    req.flush({});

    service.uploadMaterialFile('s-1', new File(['x'], 'a.pdf'), null).subscribe();
    const untitled = httpMock.expectOne(`${CLASS}/materials`);
    expect((untitled.request.body as FormData).has('title')).toBe(false);
    untitled.flush({});
  });

  it('asks for the cancellation quote and cancels with only a reason in the body', () => {
    service.getCancellationQuote('s-1').subscribe();
    httpMock.expectOne(`${CLASS}/cancellation-quote`).flush({});

    service.cancelClass('s-1', { reason: 'Family emergency' }).subscribe();
    const req = httpMock.expectOne(`${CLASS}/cancel`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Family emergency' });
    req.flush({});
  });
});
