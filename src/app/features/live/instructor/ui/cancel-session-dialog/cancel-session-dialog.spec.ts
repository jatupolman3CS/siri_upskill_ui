import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import type { LiveSession } from '../../../data/live-instructor.models';
import { CancelSessionDialog } from './cancel-session-dialog';

const CANCEL_URL = '/api/catalog/instructor/courses/c1/live-sessions/s1/cancel';

describe('CancelSessionDialog', () => {
  let fixture: ComponentFixture<CancelSessionDialog>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CancelSessionDialog);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentRef.setInput('sessionTitle', 'Excel basics');
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const open = () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
  };
  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
  const button = (label: string) =>
    Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
  const type = (value: string) => {
    const textarea = dialog()?.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  it('is closed until opened', () => {
    expect(dialog()).toBeNull();
    open();
    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain('Excel basics');
  });

  it('requires a reason: submitting empty shows an error and sends nothing', () => {
    open();
    button('Cancel session').click();
    fixture.detectChanges();

    httpMock.expectNone(CANCEL_URL);
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('give a reason');
  });

  it('sends the trimmed reason, closes, and emits the cancelled session', () => {
    const emitted: LiveSession[] = [];
    fixture.componentInstance.cancelled.subscribe((session) => emitted.push(session));
    open();
    type('  Instructor is ill  ');

    button('Cancel session').click();
    const req = httpMock.expectOne(CANCEL_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Instructor is ill' });
    const session = { id: 's1', status: 'Cancelled' } as LiveSession;
    req.flush(session);
    fixture.detectChanges();

    expect(emitted).toEqual([session]);
    expect(dialog()).toBeNull();
  });

  it('ignores a second click while the request is in flight', () => {
    open();
    type('Reason');
    const confirm = button('Cancel session');
    confirm.click();
    fixture.detectChanges();
    confirm.click();

    httpMock.expectOne(CANCEL_URL).flush({ id: 's1' });
    httpMock.expectNone(CANCEL_URL);
  });

  it('keeps the dialog open and explains a server refusal (409 session already ended)', () => {
    open();
    type('Reason');
    button('Cancel session').click();
    httpMock.expectOne(CANCEL_URL).flush({ reason: 'live.session_ended' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('starts clean when reopened', () => {
    open();
    type('Half-typed reason');
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    open();

    expect((dialog()?.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });
});
