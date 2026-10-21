import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { PhotoPanel } from './photo-panel';

const PHOTO_URL = '/api/tutoring/tutor/profile/photo';

describe('PhotoPanel', () => {
  let fixture: ComponentFixture<PhotoPanel>;
  let httpMock: HttpTestingController;
  let changed: Mock<() => void>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => root().textContent ?? '';

  function pick(file: File): void {
    const input = root().querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: { item: () => file, length: 1 } });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PhotoPanel);
    fixture.componentRef.setInput('displayName', 'Nina Tutor');
    changed = vi.fn<() => void>();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('shows the current photo with a descriptive alternative text, or a placeholder when there is none', () => {
    expect(root().querySelector('img')).toBeNull();
    expect(text()).toContain('Upload photo');

    fixture.componentRef.setInput('photoUrl', 'https://files.example/photo.jpg?sig=1');
    fixture.detectChanges();
    expect(root().querySelector('img')?.getAttribute('alt')).toBe('Profile photo of Nina Tutor');
    expect(text()).toContain('Replace photo');
  });

  it('warns that phone photos can carry the location they were taken at', () => {
    expect(text()).toContain('can contain the location');
  });

  it('refuses a file of the wrong type or size before sending anything', () => {
    pick(new File(['x'], 'icon.svg', { type: 'image/svg+xml' }));
    expect(root().querySelector('app-tutor-problem')?.textContent).toContain('This image cannot be used');
    pick(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }));
    httpMock.expectNone(PHOTO_URL);
  });

  it('uploads the image and asks the owner to reload the profile (the row version rotated)', () => {
    pick(new File([new Uint8Array([0xff, 0xd8, 0xff])], 'me.jpg', { type: 'image/jpeg' }));
    const req = httpMock.expectOne(PHOTO_URL);
    expect(req.request.method).toBe('PUT');
    req.flush({ photoUrl: 'https://files.example/new.jpg' });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('shows why the server refused the image', () => {
    pick(new File([new Uint8Array([1, 2, 3])], 'fake.png', { type: 'image/png' }));
    httpMock.expectOne(PHOTO_URL).flush({ reason: 'tutoring.image_invalid' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(root().querySelector('app-tutor-problem')?.textContent).toContain('This image cannot be used');
    expect(changed).not.toHaveBeenCalled();
  });

  it('removes the photo', () => {
    fixture.componentRef.setInput('photoUrl', 'https://files.example/photo.jpg');
    fixture.detectChanges();
    [...root().querySelectorAll('button')].find((b) => b.textContent?.includes('Remove photo'))!.click();
    const req = httpMock.expectOne(PHOTO_URL);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the profile is read-only', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    pick(new File([new Uint8Array([0xff, 0xd8, 0xff])], 'me.jpg', { type: 'image/jpeg' }));
    httpMock.expectNone(PHOTO_URL);
  });
});
