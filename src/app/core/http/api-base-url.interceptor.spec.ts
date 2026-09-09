import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { API_BASE_URL, apiBaseUrlInterceptor, resolveApiUrl } from './api-base-url.interceptor';

describe('resolveApiUrl', () => {
  it('prefixes a relative api path with the configured host', () => {
    expect(resolveApiUrl('/api/catalog/courses', 'https://api.example.com')).toBe(
      'https://api.example.com/api/catalog/courses',
    );
  });

  it('does not double up slashes when the configured host has a trailing one', () => {
    expect(resolveApiUrl('/api/catalog/courses', 'https://api.example.com/')).toBe(
      'https://api.example.com/api/catalog/courses',
    );
  });

  it('leaves the path untouched when no host is configured', () => {
    expect(resolveApiUrl('/api/catalog/courses', '')).toBe('/api/catalog/courses');
    expect(resolveApiUrl('/api/catalog/courses', '   ')).toBe('/api/catalog/courses');
  });

  it('leaves a url that already carries its own origin untouched', () => {
    expect(resolveApiUrl('https://cdn.example.com/api/thumb.jpg', 'https://api.example.com')).toBe(
      'https://cdn.example.com/api/thumb.jpg',
    );
  });

  it('only rewrites the /api segment, not paths that merely start with those letters', () => {
    expect(resolveApiUrl('/apidocs', 'https://api.example.com')).toBe('/apidocs');
    expect(resolveApiUrl('/assets/i18n/th.json', 'https://api.example.com')).toBe(
      '/assets/i18n/th.json',
    );
  });
});

describe('apiBaseUrlInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([apiBaseUrlInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends the request to the host from the active environment file', () => {
    http.get('/api/catalog/courses').subscribe();

    const expected = resolveApiUrl('/api/catalog/courses', environment.apiUrl);
    httpMock.expectOne(expected).flush({});
  });

  it('passes a non-api url through unchanged', () => {
    http.get('/assets/i18n/th.json').subscribe();

    httpMock.expectOne('/assets/i18n/th.json').flush({});
  });
});

it('uses the internal API host provided by the SSR application', () => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([apiBaseUrlInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: 'http://api:5000' },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  TestBed.inject(HttpClient).get('/api/catalog/courses').subscribe();
  httpMock.expectOne('http://api:5000/api/catalog/courses').flush({});
  httpMock.verify();
});
