import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import type { EpisodeAttachmentItem } from '../data/learning-api.models';
import { EpisodeAttachmentsComponent } from './episode-attachments.component';

const LIST_URL = '/api/catalog/episodes/ep-001/attachments';

const ATTACHMENT: EpisodeAttachmentItem = {
  id: 'att-001',
  episodeId: 'ep-001',
  fileName: 'lecture-slides.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1048576,
  createdAtUtc: '2026-08-27T00:00:00Z',
};

describe('EpisodeAttachmentsComponent', () => {
  let fixture: ComponentFixture<EpisodeAttachmentsComponent>;
  let httpMock: HttpTestingController;
  let anchorClick: ReturnType<typeof vi.spyOn>;
  let windowOpen: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch(), withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  const root = () => fixture.nativeElement as HTMLElement;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  async function mount(episodeId: string | null): Promise<void> {
    fixture = TestBed.createComponent(EpisodeAttachmentsComponent);
    fixture.componentRef.setInput('episodeId', episodeId);
    await settle();
  }

  it('shows the tab heading and loads the files of the current episode', async () => {
    await mount('ep-001');
    const req = httpMock.expectOne(LIST_URL);
    expect(req.request.method).toBe('GET');
    req.flush([ATTACHMENT]);
    await settle();

    expect(root().querySelector('h3')?.textContent).toContain('Lesson Resources & Attachments');
    expect(root().textContent).toContain('lecture-slides.pdf');
    expect(root().textContent).toContain('1 MB');
  });

  it('downloads through the signed URL the API returns (an anchor click, not window.open)', async () => {
    await mount('ep-001');
    httpMock.expectOne(LIST_URL).flush([ATTACHMENT]);
    await settle();

    const download = Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Download')) as HTMLButtonElement;
    download.click();
    await settle();
    httpMock.expectOne(`${LIST_URL}/att-001/download`).flush({
      ...ATTACHMENT,
      downloadUrl: 'https://acct.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=abc',
      expiresAtUtc: '2026-08-27T00:05:00Z',
    });

    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect((anchorClick.mock.contexts[0] as HTMLAnchorElement).href).toBe('https://acct.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=abc');
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('shows the empty message when the episode has no attachments, and nothing is requested without an episode', async () => {
    await mount('ep-001');
    httpMock.expectOne(LIST_URL).flush([]);
    await settle();
    expect(root().textContent).toContain('No downloadable resources for this lesson');

    await mount(null);
    httpMock.expectNone(() => true);
  });
});
