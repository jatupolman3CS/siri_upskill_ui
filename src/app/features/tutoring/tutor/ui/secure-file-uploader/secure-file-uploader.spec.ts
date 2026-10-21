import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import type { KycUploadEvent } from '../../../data/tutoring-kyc.models';
import { kycDocument } from '../../testing/tutor-fixtures';
import { SecureFileUploader, type SecureUploadFn } from './secure-file-uploader';

const SECRET_NAME = 'somchai-national-id-front.pdf';

describe('SecureFileUploader', () => {
  let fixture: ComponentFixture<SecureFileUploader>;
  let transfer: Subject<KycUploadEvent>;
  let upload: ReturnType<typeof vi.fn<SecureUploadFn>>;

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function pick(file: File): HTMLInputElement {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: { item: (index: number) => (index === 0 ? file : null), length: 1 } });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    return input;
  }

  function pdf(name = SECRET_NAME, size = 1024): File {
    return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    useTutoringLanguage('en');
    transfer = new Subject<KycUploadEvent>();
    upload = vi.fn<SecureUploadFn>(() => transfer);
    fixture = TestBed.createComponent(SecureFileUploader);
    fixture.componentRef.setInput('title', 'National ID card');
    fixture.componentRef.setInput('upload', upload);
    fixture.componentRef.setInput('allowedExtensions', ['.pdf', '.jpg', '.png']);
    fixture.componentRef.setInput('maxBytes', 10 * 1024 * 1024);
    fixture.detectChanges();
  });

  it('names the slot on the button and warns that the file cannot be viewed again', () => {
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.textContent).toContain('National ID card');
    expect(text()).toContain('You will not be able to view this file again');
  });

  it('rejects an empty, an oversized and a wrong-type file before sending anything', () => {
    pick(pdf(SECRET_NAME, 0));
    expect(text()).toContain('This file is empty');

    pick(pdf(SECRET_NAME, 10 * 1024 * 1024 + 1));
    expect(text()).toContain('larger than 10 MB');

    pick(new File(['x'], 'scan.exe', { type: 'application/octet-stream' }));
    expect(text()).toContain('This file type is not accepted');

    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads, shows progress, then reports success and emits "uploaded" once', () => {
    const uploaded = vi.fn();
    fixture.componentInstance.uploaded.subscribe(uploaded);

    pick(pdf());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1]).toBeNull();

    transfer.next({ type: 'progress', percent: 40 });
    fixture.detectChanges();
    const bar = (fixture.nativeElement as HTMLElement).querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(uploaded).not.toHaveBeenCalled();

    transfer.next({ type: 'done', document: kycDocument() });
    fixture.detectChanges();
    expect(text()).toContain('Uploaded.');
    expect(uploaded).toHaveBeenCalledTimes(1);
  });

  it('never shows the file name - not while sending, not when done, not when it fails', () => {
    pick(pdf());
    expect(text()).not.toContain('somchai');
    transfer.next({ type: 'progress', percent: 10 });
    fixture.detectChanges();
    expect(text()).not.toContain('somchai');
    transfer.error(new ApiError(400, 'x', 'validation', { reason: 'tutoring.kyc.file_rejected' }));
    fixture.detectChanges();
    expect(text()).not.toContain('somchai');
  });

  it('clears the native input straight after the pick so the browser keeps no reference to the file', () => {
    const input = pick(pdf());
    expect(input.value).toBe('');
  });

  it('explains a server refusal in its own words, never with server text', () => {
    pick(pdf());
    transfer.error(new ApiError(400, 'SERVER SIDE TEXT', 'validation', { reason: 'tutoring.kyc.file_rejected', title: 'SERVER SIDE TEXT' }));
    fixture.detectChanges();
    expect(text()).toContain('This file was not accepted');
    expect(text()).not.toContain('SERVER SIDE TEXT');
  });

  describe('when the server names the reason a file was refused (the category travels in the standard problem `detail`)', () => {
    function refuse(detail: unknown): void {
      pick(pdf());
      transfer.error(new ApiError(400, String(detail), 'validation', { reason: 'tutoring.kyc.file_rejected', detail, title: 'SERVER SIDE TEXT' }));
      fixture.detectChanges();
    }

    it('says the file is too big, with the limit the slot was given', () => {
      refuse('size');
      expect(text()).toContain('This file is larger than 10 MB.');
      expect(text()).not.toContain('SERVER SIDE TEXT');
    });

    it('says the file type is not accepted and lists the allowed ones', () => {
      refuse('type');
      expect(text()).toContain('This file type is not accepted. Use one of: .pdf, .jpg, .png.');
    });

    it('says the contents do not match the type or the file is damaged (signature)', () => {
      refuse('signature');
      expect(text()).toContain('do not match its type');
      expect(text()).not.toContain('This file was not accepted');
    });

    it('says the file has scripts / active content (active_content)', () => {
      refuse('active_content');
      expect(text()).toContain('scripts or other active content');
    });

    it('falls back to the general refusal for a category it does not know, and still never shows server text', () => {
      refuse('something_new');
      expect(text()).toContain('This file was not accepted');
      expect(text()).not.toContain('something_new');
      expect(text()).not.toContain('SERVER SIDE TEXT');
    });

    it('speaks Thai when the language is Thai', () => {
      useTutoringLanguage('th');
      refuse('signature');
      expect(text()).toContain('ไม่ตรงกับชนิดไฟล์');
    });

    it('lets the tutor pick another file after a refusal', () => {
      refuse('active_content');
      transfer = new Subject<KycUploadEvent>();
      upload.mockImplementation(() => transfer);
      pick(pdf('other.pdf'));
      expect(upload).toHaveBeenCalledTimes(2);
      expect(text()).not.toContain('scripts or other active content');
    });
  });

  it('ignores a second pick while an upload is running', () => {
    pick(pdf());
    pick(pdf('other.pdf'));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('aborts the request when the component is destroyed mid-upload', () => {
    pick(pdf());
    expect(transfer.observed).toBe(true);
    fixture.destroy();
    expect(transfer.observed).toBe(false);
  });
});
