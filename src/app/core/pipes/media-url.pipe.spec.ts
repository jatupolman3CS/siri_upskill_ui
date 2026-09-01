import { TestBed } from '@angular/core/testing';
import { MediaUrlPipe } from './media-url.pipe';
import { environment } from '../../../environments/environment';

describe('MediaUrlPipe', () => {
  let pipe: MediaUrlPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MediaUrlPipe],
    });
    pipe = TestBed.inject(MediaUrlPipe);
  });

  it('creates an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('returns empty string or fallback for null/empty values', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform(null, '/fallback.png')).toBe('/fallback.png');
  });

  it('returns absolute http/https URLs unchanged', () => {
    const externalUrl = 'https://cdn.example.com/images/course.jpg';
    expect(pipe.transform(externalUrl)).toBe(externalUrl);

    const httpUrl = 'http://example.com/pic.png';
    expect(pipe.transform(httpUrl)).toBe(httpUrl);
  });

  it('returns data URI and blob URI unchanged', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE...';
    expect(pipe.transform(dataUri)).toBe(dataUri);

    const blobUri = 'blob:http://localhost:4200/some-guid';
    expect(pipe.transform(blobUri)).toBe(blobUri);
  });

  it('prefixes relative storage path with the base URL', () => {
    const relativePath = 'courses/thumbnails/lesson-1.webp';
    const baseUrl = environment.apiUrl;
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    expect(pipe.transform(relativePath)).toBe(`${cleanBase}/${relativePath}`);
  });

  it('handles relative paths that already start with slash', () => {
    const relativePath = '/uploads/avatars/user-99.png';
    const baseUrl = environment.apiUrl;
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    expect(pipe.transform(relativePath)).toBe(`${cleanBase}${relativePath}`);
  });
});
