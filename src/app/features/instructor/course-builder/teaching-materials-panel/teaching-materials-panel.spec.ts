import { HttpClient, HttpEventType, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { UPLOAD_HTTP_CLIENT } from '../../../../core/http/upload-http-client';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { TeachingMaterial, TeachingMaterialKind } from '../../../catalog/data/teaching-materials.models';
import { TeachingMaterialsPanel } from './teaching-materials-panel';

const EP_URL = '/api/catalog/episodes/ep-1/attachments';
const SESSION_URL = '/api/catalog/live-sessions/s-1/attachments';

const material = (id: string, fileName: string, sizeBytes = 1048576): TeachingMaterial => ({
  id,
  fileName,
  contentType: 'application/pdf',
  sizeBytes,
  createdAtUtc: '2026-10-10T01:00:00Z',
});

describe('TeachingMaterialsPanel', () => {
  let fixture: ComponentFixture<TeachingMaterialsPanel>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: UPLOAD_HTTP_CLIENT, useExisting: HttpClient },
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const button = (label: string) =>
    Array.from(root().querySelectorAll('button')).find(
      (b) => b.textContent?.includes(label) || b.getAttribute('aria-label')?.includes(label),
    ) as HTMLButtonElement | undefined;
  const header = () => root().querySelector('button[aria-expanded]') as HTMLButtonElement;
  /** The visible file rows only (the screen-reader announcement region also mentions file names). */
  const rowsText = () => Array.from(root().querySelectorAll('li')).map((li) => li.textContent ?? '').join(' ');
  const alerts = () => Array.from(root().querySelectorAll('[role="alert"]')).map((el) => el.textContent?.trim() ?? '');
  const announcements = () => Array.from(root().querySelectorAll('[role="status"]')).map((el) => el.textContent?.trim() ?? '');

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  async function mount(parentId: string | null, kind: TeachingMaterialKind = 'episode', canUpload = true): Promise<void> {
    fixture = TestBed.createComponent(TeachingMaterialsPanel);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('parentId', parentId);
    fixture.componentRef.setInput('canUpload', canUpload);
    await settle();
  }

  /** Mounts, opens the panel and answers the list request. */
  async function openWith(items: TeachingMaterial[], url = EP_URL, kind: TeachingMaterialKind = 'episode', canUpload = true): Promise<void> {
    await mount(kind === 'episode' ? 'ep-1' : 's-1', kind, canUpload);
    header().click();
    await settle();
    httpMock.expectOne(url).flush(items);
    await settle();
  }

  async function pick(...files: File[]): Promise<void> {
    const input = root().querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  const upload = (url = EP_URL): TestRequest => httpMock.expectOne((r) => r.method === 'POST' && r.url === url);

  describe('opening', () => {
    it('is collapsed by default and asks the server for nothing until it is opened', async () => {
      await mount('ep-1');
      expect(header().getAttribute('aria-expanded')).toBe('false');
      expect(header().textContent).toContain('Teaching materials');
      httpMock.expectNone(EP_URL);
    });

    it('lists the attached files with their sizes once opened, and counts them in the header', async () => {
      await openWith([material('a1', 'lecture-slides.pdf'), material('a2', 'notes.docx', 1536)]);
      expect(header().getAttribute('aria-expanded')).toBe('true');
      const rows = Array.from(root().querySelectorAll('li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
      expect(rows[0]).toContain('lecture-slides.pdf');
      expect(rows[0]).toContain('1 MB');
      expect(rows[1]).toContain('notes.docx');
      expect(rows[1]).toContain('1.5 KB');
      expect(header().textContent).toContain('2');
    });

    it('fetches only once when closed and opened again', async () => {
      await openWith([material('a1', 'a.pdf')]);
      header().click();
      await settle();
      header().click();
      await settle();
      httpMock.expectNone(EP_URL);
      expect(text()).toContain('a.pdf');
    });

    it('says so when nothing is attached', async () => {
      await openWith([]);
      expect(text()).toContain('No materials attached yet.');
    });

    it('shows a retryable error when the list cannot be loaded', async () => {
      await mount('ep-1');
      header().click();
      await settle();
      httpMock.expectOne(EP_URL).flush({}, { status: 500, statusText: 'err' });
      await settle();
      expect(alerts()[0]).toContain("Couldn't load the materials.");
      expect(root().querySelector('input[type="file"]')).toBeNull();

      button('Try again')?.click();
      await settle();
      httpMock.expectOne(EP_URL).flush([material('a1', 'a.pdf')]);
      await settle();
      expect(text()).toContain('a.pdf');
      expect(alerts()).toEqual([]);
    });

    it('uses the live-session route for a session', async () => {
      await openWith([material('a1', 'slides.pptx')], SESSION_URL, 'session');
      expect(text()).toContain('slides.pptx');
    });
  });

  describe('an episode that has no server id yet', () => {
    it('explains instead of calling the API, and offers no upload', async () => {
      await mount(null);
      header().click();
      await settle();
      expect(text()).toContain('Save this lesson first');
      expect(root().querySelector('input[type="file"]')).toBeNull();
      httpMock.expectNone(() => true);
    });

    it('loads the files once the autosave gives the episode its id', async () => {
      await mount(null);
      header().click();
      await settle();
      fixture.componentRef.setInput('parentId', 'ep-1');
      await settle();
      httpMock.expectOne(EP_URL).flush([material('a1', 'a.pdf')]);
      await settle();
      expect(text()).toContain('a.pdf');
      expect(root().querySelector('input[type="file"]')).not.toBeNull();
    });
  });

  describe('a cancelled live session', () => {
    it('hides the upload zone and says why, while still letting the instructor remove files', async () => {
      await openWith([material('a1', 'old.pdf')], SESSION_URL, 'session', false);
      expect(button('Choose files')).toBeUndefined();
      expect(root().querySelector('input[type="file"]')).toBeNull();
      expect(text()).toContain('This session was cancelled');
      expect(button('Delete old.pdf')).toBeDefined();
    });
  });

  describe('choosing files', () => {
    it('refuses a file type the server would refuse, without sending anything', async () => {
      await openWith([]);
      await pick(new File(['MZ'], 'setup.exe'));
      expect(alerts().join(' ')).toContain('"setup.exe" is not a supported file type');
      httpMock.expectNone((r) => r.method === 'POST');
    });

    it('refuses an empty file and one above the size cap', async () => {
      await openWith([]);
      const huge = new File(['x'], 'huge.pdf');
      Object.defineProperty(huge, 'size', { value: 60 * 1024 * 1024 });
      await pick(new File([], 'empty.pdf'), huge);
      const shown = alerts().join(' ');
      expect(shown).toContain('"empty.pdf" is empty');
      expect(shown).toContain('"huge.pdf" is larger than 50 MB');
      httpMock.expectNone((r) => r.method === 'POST');
    });

    it('refuses files beyond the per-item maximum', async () => {
      const full = Array.from({ length: 30 }, (_, i) => material(`a${i}`, `file-${i}.pdf`));
      await openWith(full);
      await pick(new File(['%PDF'], 'one-too-many.pdf'));
      expect(alerts().join(' ')).toContain('at most 30 files');
      httpMock.expectNone((r) => r.method === 'POST');
    });

    it('still uploads the good files of a mixed batch', async () => {
      await openWith([]);
      await pick(new File(['%PDF'], 'good.pdf'), new File(['MZ'], 'bad.exe'));
      expect(alerts().join(' ')).toContain('"bad.exe"');
      upload().flush(material('n1', 'good.pdf'));
    });
  });

  describe('uploading', () => {
    it('sends the file as multipart form data and shows a progress bar that follows the transfer', async () => {
      await openWith([]);
      await pick(new File(['%PDF-1.7'], 'slides.pdf'));

      const req = upload();
      expect((req.request.body as FormData).get('file')).toBeInstanceOf(File);
      expect(text()).toContain('slides.pdf');
      expect(text()).toContain('Uploading 0%');

      req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
      await settle();
      const bar = root().querySelector('[role="progressbar"]') as HTMLElement;
      expect(bar.getAttribute('aria-valuenow')).toBe('50');
      expect(bar.getAttribute('aria-label')).toBe('Upload progress for slides.pdf');
      expect(text()).toContain('Uploading 50%');

      req.event({ type: HttpEventType.UploadProgress, loaded: 100, total: 100 });
      await settle();
      expect(root().querySelector('[role="progressbar"]')).toBeNull();
      expect(text()).toContain('Upload complete. Checking and saving the file...');
      req.flush(material('n1', 'slides.pdf', 8));
    });

    it('moves a finished file into the list, announces it, and updates the count', async () => {
      await openWith([material('a1', 'old.pdf')]);
      await pick(new File(['%PDF-1.7'], 'slides.pdf'));
      upload().flush(material('n1', 'slides.pdf', 8));
      await settle();

      expect(root().querySelector('[role="progressbar"]')).toBeNull();
      const names = Array.from(root().querySelectorAll('li')).map((li) => li.textContent);
      expect(names.some((n) => n?.includes('slides.pdf') && n.includes('8 B'))).toBe(true);
      expect(announcements()).toContain('slides.pdf was uploaded.');
      expect(header().textContent).toContain('2');
    });

    it('sends several files one after another, not all at once', async () => {
      await openWith([]);
      await pick(new File(['%PDF'], 'one.pdf'), new File(['%PDF'], 'two.pdf'));
      const first = upload();
      expect(text()).toContain('Waiting in the upload queue');
      httpMock.expectNone((r) => r.method === 'POST');

      first.flush(material('n1', 'one.pdf'));
      await settle();
      upload().flush(material('n2', 'two.pdf'));
      await settle();
      expect(text()).not.toContain('Waiting in the upload queue');
      expect(header().textContent).toContain('2');
    });

    it.each([
      [409, 'conflict', 'this session was cancelled, or the maximum number of files'],
      [403, 'forbidden', "You don't have permission to manage the materials here."],
      [400, 'validation', 'The file was rejected: ไฟล์เนื้อหาไม่ตรงกับนามสกุล'],
      [503, 'attachment.virus_scanner_not_configured', 'File uploads are temporarily unavailable because files cannot be checked for viruses'],
      [503, 'storage.provider_not_configured', 'Document storage is temporarily unavailable'],
      [503, 'unavailable', 'File storage is temporarily unavailable. Please try again.'],
    ])('explains a %s %s failure next to the file and offers a retry', async (status, errorCode, expected) => {
      await openWith([]);
      await pick(new File(['%PDF'], 'slides.pdf'));
      upload().flush(
        { title: status === 400 ? 'ไฟล์เนื้อหาไม่ตรงกับนามสกุล' : 'English title', errorCode },
        { status, statusText: 'err' },
      );
      await settle();

      expect(alerts().length).toBe(0);
      expect(text()).toContain(expected);
      expect(button('Retry uploading slides.pdf')).toBeDefined();
      expect(button('Dismiss the message for slides.pdf')).toBeDefined();
      expect(announcements().join(' ')).toContain('Could not upload slides.pdf');
    });

    it('explains a 413 from the proxy (which carries no problem body)', async () => {
      await openWith([]);
      await pick(new File(['%PDF'], 'slides.pdf'));
      upload().flush('<html>Request Entity Too Large</html>', { status: 413, statusText: 'Payload Too Large' });
      await settle();
      expect(text()).toContain('The file is larger than the server accepts.');
    });

    it('retries a failed upload and can dismiss it instead', async () => {
      await openWith([]);
      await pick(new File(['%PDF'], 'slides.pdf'));
      upload().flush({}, { status: 503, statusText: 'err' });
      await settle();

      button('Retry uploading slides.pdf')?.click();
      await settle();
      upload().flush({}, { status: 503, statusText: 'err' });
      await settle();

      button('Dismiss the message for slides.pdf')?.click();
      await settle();
      expect(rowsText()).not.toContain('slides.pdf');
    });

    it('aborts the transfer when the panel goes away', async () => {
      await openWith([]);
      await pick(new File(['%PDF'], 'slides.pdf'));
      const req = upload();
      fixture.destroy();
      expect(req.cancelled).toBe(true);
    });
  });

  describe('deleting', () => {
    const dialog = () => root().querySelector('[role="dialog"]');

    it('asks for confirmation naming the file, and does nothing if the instructor backs out', async () => {
      await openWith([material('a1', 'old.pdf')]);
      button('Delete old.pdf')?.click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(dialog()?.textContent).toContain('Delete this file?');
      expect(dialog()?.textContent).toContain('"old.pdf" will be permanently deleted');

      button('Cancel')?.click();
      await settle();
      expect(dialog()).toBeNull();
      expect(text()).toContain('old.pdf');
      httpMock.expectNone((r) => r.method === 'DELETE');
    });

    it('deletes on confirmation, removes the row and announces it', async () => {
      await openWith([material('a1', 'old.pdf'), material('a2', 'keep.pdf')]);
      button('Delete old.pdf')?.click();
      await settle();
      button('Delete file')?.click();
      await settle();

      const req = httpMock.expectOne(`${EP_URL}/a1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(dialog()).toBeNull();
      expect(rowsText()).not.toContain('old.pdf');
      expect(rowsText()).toContain('keep.pdf');
      expect(announcements()).toContain('old.pdf was deleted.');
      expect(header().textContent).toContain('1');
    });

    it('keeps the file and says why when the server refuses the delete', async () => {
      await openWith([material('a1', 'old.pdf')]);
      button('Delete old.pdf')?.click();
      await settle();
      button('Delete file')?.click();
      await settle();
      httpMock.expectOne(`${EP_URL}/a1`).flush({ title: 'Forbidden', errorCode: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
      await settle();

      expect(dialog()).toBeNull();
      expect(text()).toContain('old.pdf');
      expect(alerts().join(' ')).toContain("You don't have permission to manage the materials here.");
    });

    it('does not send the delete twice on a double click', async () => {
      await openWith([material('a1', 'old.pdf')]);
      button('Delete old.pdf')?.click();
      await settle();
      const confirm = button('Delete file') as HTMLButtonElement;
      confirm.click();
      (fixture.componentInstance as unknown as { confirmDelete(): void }).confirmDelete();
      httpMock.expectOne(`${EP_URL}/a1`).flush(null, { status: 204, statusText: 'No Content' });
    });

    it('gives every delete button the name of its own file', async () => {
      await openWith([material('a1', 'one.pdf'), material('a2', 'two.pdf')]);
      const labels = Array.from(root().querySelectorAll('button[aria-label]')).map((b) => b.getAttribute('aria-label'));
      expect(labels).toContain('Delete one.pdf');
      expect(labels).toContain('Delete two.pdf');
    });
  });
});
