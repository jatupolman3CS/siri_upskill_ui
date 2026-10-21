import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../../testing/spec-helpers';
import { TutorPresenceCheck } from './tutor-presence-check';

const URL = '/api/tutoring/sessions/s-1/tutor-present';

describe('TutorPresenceCheck', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [TutorPresenceCheck], providers: [...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  /** Renders the check for a class that started `startedMsAgo` ms ago on the server clock. */
  async function render(startedMsAgo: number, offsetMs = 0): Promise<{ fixture: ComponentFixture<TutorPresenceCheck>; root: HTMLElement }> {
    const fixture = TestBed.createComponent(TutorPresenceCheck);
    fixture.componentRef.setInput('sessionId', 's-1');
    fixture.componentRef.setInput('startsAtUtc', new Date(Date.now() + offsetMs - startedMsAgo).toISOString());
    fixture.componentRef.setInput('offsetMs', offsetMs);
    await settle(fixture);
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('asks nothing before the class has been running for five minutes', async () => {
    const { root } = await render(60_000);

    expect(textOf(root).trim()).toBe('');
  });

  it('asks as soon as it is open at five minutes after the start', async () => {
    const { root } = await render(6 * 60_000);

    expect(textOf(root)).toContain('Has your tutor joined the classroom?');
    expect(root.querySelector('[role="status"]')).not.toBeNull();
  });

  it('appears by itself when the five minutes pass while the learner waits', async () => {
    vi.useFakeTimers();
    const { fixture, root } = await render(4 * 60_000 + 58_000);
    expect(textOf(root).trim()).toBe('');

    vi.advanceTimersByTime(3_000);
    await settle(fixture);

    expect(textOf(root)).toContain('Has your tutor joined the classroom?');
  });

  it('measures the five minutes on the server clock, not the device clock', async () => {
    // The device clock is 10 minutes slow: by the server only 2 minutes have passed, although the device says -8.
    const { root } = await render(2 * 60_000, 10 * 60_000);

    expect(textOf(root).trim()).toBe('');
  });

  it('tells the server the tutor is present with an empty POST and thanks the learner', async () => {
    const { fixture, root } = await render(6 * 60_000);

    buttonByText(root, 'Yes, they are here')?.click();
    await settle(fixture);
    const request = httpMock.expectOne(URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    expect(textOf(root)).toContain('We have noted that your tutor is present.');
    expect(root.querySelector('button')).toBeNull();
  });

  it('cannot be sent twice while the request is in flight', async () => {
    const { fixture, root } = await render(6 * 60_000);

    const button = buttonByText(root, 'Yes, they are here');
    button?.click();
    button?.click();
    await settle(fixture);

    httpMock.expectOne(URL).flush(null, { status: 204, statusText: 'No Content' });
  });

  it('closes without calling anything on "Not yet"', async () => {
    const { fixture, root } = await render(6 * 60_000);

    buttonByText(root, 'Not yet')?.click();
    await settle(fixture);

    httpMock.expectNone(URL);
    expect(textOf(root).trim()).toBe('');
  });

  it('shows what the server answered when it cannot record the statement, and lets the learner try again or dismiss', async () => {
    const { fixture, root } = await render(6 * 60_000);

    buttonByText(root, 'Yes, they are here')?.click();
    await settle(fixture);
    httpMock.expectOne(URL).flush({ title: 'Not found', status: 404, errorCode: 'not_found', reason: 'tutoring.not_found' }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('We could not find that item.');
    expect(buttonByText(root, 'Yes, they are here')).not.toBeNull();
    expect(buttonByText(root, 'Not yet')).not.toBeNull();
  });
});
