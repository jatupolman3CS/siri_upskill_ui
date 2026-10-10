import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../core/i18n/translation.service';
import type { UploadItem } from './material-upload-queue';
import { MaterialUploadRow } from './material-upload-row';

const item = (overrides: Partial<UploadItem> = {}): UploadItem => ({
  id: 1,
  file: new File(['x'], 'slides.pdf'),
  status: 'uploading',
  percent: 0,
  error: null,
  ...overrides,
});

describe('MaterialUploadRow', () => {
  let fixture: ComponentFixture<MaterialUploadRow>;

  const root = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) => root().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

  function render(upload: UploadItem): void {
    fixture = TestBed.createComponent(MaterialUploadRow);
    fixture.componentRef.setInput('upload', upload);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MaterialUploadRow] });
    TestBed.inject(TranslationService).setLocale('en');
  });

  it('shows a waiting file as queued, without a progress bar', () => {
    render(item({ status: 'queued' }));
    expect(root().textContent).toContain('slides.pdf');
    expect(root().textContent).toContain('Waiting in the upload queue');
    expect(root().querySelector('[role="progressbar"]')).toBeNull();
  });

  it('shows the percentage as text and as a named progress bar while bytes are being sent', () => {
    render(item({ percent: 42 }));
    expect(root().textContent).toContain('Uploading 42%');
    const bar = root().querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-label')).toBe('Upload progress for slides.pdf');
  });

  it('switches to "checking and saving" once every byte is sent and the server is still working', () => {
    render(item({ percent: 100 }));
    expect(root().querySelector('[role="progressbar"]')).toBeNull();
    expect(root().textContent).toContain('Upload complete. Checking and saving the file...');
  });

  it('shows why a file failed and offers retry and dismiss, each named after the file', () => {
    render(item({ status: 'failed', error: { key: 'teachingMaterials.error.conflict' } }));
    expect(root().textContent).toContain('The file could not be added');

    const retried = vi.fn();
    const dismissed = vi.fn();
    fixture.componentInstance.retry.subscribe(retried);
    fixture.componentInstance.dismiss.subscribe(dismissed);
    button('Retry uploading slides.pdf')?.click();
    button('Dismiss the message for slides.pdf')?.click();
    expect(retried).toHaveBeenCalledTimes(1);
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('offers no retry or dismiss while a file is waiting or in flight', () => {
    render(item({ status: 'uploading', percent: 10 }));
    expect(root().querySelectorAll('button')).toHaveLength(0);
  });
});
