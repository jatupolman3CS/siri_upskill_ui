import { HttpClient, HttpEvent, HttpEventType, provideHttpClient, withFetch } from '@angular/common/http';
import { XhrFactory } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { accessTokenStore } from './access-token.store';
import { ApiError } from './error.interceptor';
import { UPLOAD_HTTP_CLIENT } from './upload-http-client';

type Listener = (event: unknown) => void;

/** Just enough of `XMLHttpRequest` for Angular's `HttpXhrBackend`, driven by hand from the tests. */
class FakeXhr {
  static last: FakeXhr | null = null;

  readonly DONE = 4;
  readyState = 0;
  status = 0;
  statusText = '';
  response: unknown = null;
  responseURL = '';
  responseType = '';
  withCredentials = false;
  timeout = 0;
  method = '';
  url = '';
  body: unknown = null;
  readonly headers: Record<string, string> = {};
  readonly upload = {
    addEventListener: (type: string, listener: Listener) => this.uploadListeners.set(type, listener),
    removeEventListener: (type: string) => this.uploadListeners.delete(type),
  };

  private readonly listeners = new Map<string, Listener>();
  private readonly uploadListeners = new Map<string, Listener>();

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: unknown): void {
    this.body = body;
  }
  abort(): void {
    this.readyState = this.DONE;
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
  getAllResponseHeaders(): string {
    return 'content-type: application/json\r\n';
  }

  progress(loaded: number, total: number): void {
    this.uploadListeners.get('progress')?.({ loaded, total, lengthComputable: true });
  }
  respond(status: number, body: unknown): void {
    this.status = status;
    this.statusText = status === 201 ? 'Created' : 'Error';
    this.response = JSON.stringify(body);
    this.readyState = this.DONE;
    this.listeners.get('load')?.({});
  }
}

describe('UPLOAD_HTTP_CLIENT', () => {
  let client: HttpClient;

  beforeEach(() => {
    FakeXhr.last = null;
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), { provide: XhrFactory, useValue: { build: () => new FakeXhr() } }],
    });
    client = TestBed.inject(UPLOAD_HTTP_CLIENT);
  });

  afterEach(() => accessTokenStore.set(null));

  function upload(): { readonly events: HttpEvent<unknown>[]; readonly errors: unknown[] } {
    const events: HttpEvent<unknown>[] = [];
    const errors: unknown[] = [];
    const body = new FormData();
    body.append('file', new File(['x'], 'a.pdf'));
    client
      .post('/api/catalog/episodes/e1/attachments', body, { reportProgress: true, observe: 'events' })
      .subscribe({ next: (event) => events.push(event), error: (error: unknown) => errors.push(error) });
    return { events, errors };
  }

  it('is a different client from the app-wide fetch one', () => {
    expect(client).not.toBe(TestBed.inject(HttpClient));
  });

  it('reports real upload progress (which the fetch backend never can) and then the response', () => {
    const { events } = upload();
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/catalog/episodes/e1/attachments');

    xhr.progress(25, 100);
    xhr.progress(100, 100);
    xhr.respond(201, { id: 'a1' });

    const uploadProgress = events.filter((event) => event.type === HttpEventType.UploadProgress);
    expect(uploadProgress.map((event) => (event as { loaded: number }).loaded)).toEqual([25, 100]);
    const last = events[events.length - 1];
    expect(last.type).toBe(HttpEventType.Response);
    expect((last as { body: unknown }).body).toEqual({ id: 'a1' });
  });

  it('sends the FormData untouched, leaving the multipart Content-Type boundary to the browser', () => {
    upload();
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.body).toBeInstanceOf(FormData);
    expect(Object.keys(xhr.headers).map((name) => name.toLowerCase())).not.toContain('content-type');
  });

  it('still runs the app interceptors: bearer token on the way out, ApiError on the way back', () => {
    accessTokenStore.set('access-token-1');
    const { errors } = upload();
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.headers['Authorization']).toBe('Bearer access-token-1');

    xhr.respond(409, { title: 'Conflict', errorCode: 'conflict' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ApiError);
    expect((errors[0] as ApiError).status).toBe(409);
    expect((errors[0] as ApiError).code).toBe('conflict');
  });
});
