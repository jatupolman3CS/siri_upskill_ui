import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { errorInterceptor } from '../../../../core/http/error.interceptor';
import { TranslationService } from '../../../../core/i18n/translation.service';
import type { TeachingMaterial, TeachingMaterialKind } from '../../data/teaching-materials.models';
import { LearnerMaterialsList } from './learner-materials-list';

const SESSION_URL = '/api/catalog/live-sessions/s-1/attachments';
const EPISODE_URL = '/api/catalog/episodes/ep-1/attachments';

const material = (id: string, fileName: string, sizeBytes = 1048576): TeachingMaterial => ({
  id,
  fileName,
  contentType: 'application/pdf',
  sizeBytes,
  createdAtUtc: '2026-10-10T01:00:00Z',
});

const download = (id: string, fileName: string, downloadUrl: string) => ({
  ...material(id, fileName),
  downloadUrl,
  expiresAtUtc: '2026-10-10T01:05:00Z',
});

describe('LearnerMaterialsList', () => {
  let fixture: ComponentFixture<LearnerMaterialsList>;
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
  const text = () => (root().textContent ?? '').replace(/\s+/g, ' ').trim();
  const alerts = () => Array.from(root().querySelectorAll('[role="alert"]')).map((el) => el.textContent?.trim() ?? '');
  const button = (label: string) =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  async function mount(options: { kind?: TeachingMaterialKind; parentId?: string | null; quiet?: boolean; headingKey?: string } = {}): Promise<void> {
    fixture = TestBed.createComponent(LearnerMaterialsList);
    fixture.componentRef.setInput('kind', options.kind ?? 'session');
    fixture.componentRef.setInput('parentId', options.parentId === undefined ? 's-1' : options.parentId);
    fixture.componentRef.setInput('quiet', options.quiet ?? false);
    if (options.headingKey) {
      fixture.componentRef.setInput('headingKey', options.headingKey);
    }
    await settle();
  }

  async function answer(url: string, body: object | string | null, init?: { status: number; statusText: string }): Promise<void> {
    httpMock.expectOne(url).flush(body, init);
    await settle();
  }

  describe('the list', () => {
    it('shows a loading message, then each file with its size and a download button named after it', async () => {
      await mount();
      expect(text()).toContain('Loading materials...');
      await answer(SESSION_URL, [material('a1', 'slides.pdf'), material('a2', 'handout.docx', 2048)]);

      expect(text()).toContain('slides.pdf');
      expect(text()).toContain('1 MB');
      expect(text()).toContain('handout.docx');
      expect(text()).toContain('2 KB');
      expect(button('Download: slides.pdf')).toBeDefined();
      expect(button('Download: handout.docx')).toBeDefined();
    });

    it('uses the episode route for an episode', async () => {
      await mount({ kind: 'episode', parentId: 'ep-1' });
      await answer(EPISODE_URL, [material('a1', 'worksheet.xlsx')]);
      expect(text()).toContain('worksheet.xlsx');
    });

    it('shows the optional heading above a list that has files', async () => {
      await mount({ headingKey: 'teachingMaterials.learner.sessionHeading' });
      await answer(SESSION_URL, [material('a1', 'slides.pdf')]);
      expect(root().querySelector('h5')?.textContent).toContain('Materials for this session');
    });

    it('requests nothing until it knows which episode or session to show', async () => {
      await mount({ parentId: null });
      httpMock.expectNone(() => true);
      expect(text()).toContain('No downloadable resources for this lesson');
    });

    it('asks again when the episode changes', async () => {
      await mount({ kind: 'episode', parentId: 'ep-1' });
      await answer(EPISODE_URL, [material('a1', 'one.pdf')]);
      fixture.componentRef.setInput('parentId', 'ep-2');
      await settle();
      await answer('/api/catalog/episodes/ep-2/attachments', [material('b1', 'two.pdf')]);
      expect(text()).toContain('two.pdf');
      expect(text()).not.toContain('one.pdf');
    });
  });

  describe('when there is nothing to show', () => {
    it('says so in the classroom tab', async () => {
      await mount();
      await answer(SESSION_URL, []);
      expect(text()).toContain('No downloadable resources for this lesson');
    });

    it('treats a 404 (no access) as simply nothing to show, not an error', async () => {
      await mount();
      await answer(SESSION_URL, { title: 'Not found', errorCode: 'not_found' }, { status: 404, statusText: 'Not Found' });
      expect(alerts()).toEqual([]);
      expect(text()).toContain('No downloadable resources for this lesson');
    });

    it('renders nothing at all in quiet mode: while loading, when empty, on 404 and on a failure', async () => {
      await mount({ quiet: true });
      expect(text()).toBe('');
      await answer(SESSION_URL, []);
      expect(text()).toBe('');

      await mount({ quiet: true });
      await answer(SESSION_URL, {}, { status: 404, statusText: 'Not Found' });
      expect(text()).toBe('');

      await mount({ quiet: true });
      await answer(SESSION_URL, {}, { status: 500, statusText: 'err' });
      expect(text()).toBe('');
      expect(alerts()).toEqual([]);
    });
  });

  describe('when the list cannot be loaded', () => {
    it('offers a retry in the classroom tab', async () => {
      await mount();
      await answer(SESSION_URL, {}, { status: 500, statusText: 'err' });
      expect(alerts()[0]).toContain("Couldn't load the materials.");

      button('Try again')?.click();
      await settle();
      await answer(SESSION_URL, [material('a1', 'slides.pdf')]);
      expect(alerts()).toEqual([]);
      expect(text()).toContain('slides.pdf');
    });
  });

  describe('downloading', () => {
    const URL_1 = 'https://acct.r2.cloudflarestorage.com/bucket/key-1?X-Amz-Signature=abc';

    async function mountWithFile(quiet = false): Promise<void> {
      await mount({ quiet });
      await answer(SESSION_URL, [material('a1', 'slides.pdf')]);
    }

    it('fetches a fresh signed URL on click and follows it with an anchor, never window.open', async () => {
      await mountWithFile();
      button('Download: slides.pdf')?.click();
      await settle();
      expect(button('Download: slides.pdf')?.disabled).toBe(true);

      await answer(`${SESSION_URL}/a1/download`, download('a1', 'slides.pdf', URL_1));

      expect(anchorClick).toHaveBeenCalledTimes(1);
      const anchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.href).toBe(URL_1);
      expect(anchor.download).toBe('slides.pdf');
      expect(windowOpen).not.toHaveBeenCalled();
      expect(button('Download: slides.pdf')?.disabled).toBe(false);
    });

    it('ignores a second click while the first download is being prepared', async () => {
      await mountWithFile();
      const open = button('Download: slides.pdf') as HTMLButtonElement;
      open.click();
      (fixture.componentInstance as unknown as { download(m: TeachingMaterial): void }).download(material('a1', 'slides.pdf'));
      await answer(`${SESSION_URL}/a1/download`, download('a1', 'slides.pdf', URL_1));
      expect(anchorClick).toHaveBeenCalledTimes(1);
    });

    it.each([
      [503, 'storage.provider_not_configured', 'Document storage is temporarily unavailable'],
      [503, 'unavailable', 'File storage is temporarily unavailable. Please try again.'],
      [404, 'not_found', 'This item was not found or you no longer have access.'],
      [401, undefined, 'Your session has expired. Please sign in again.'],
    ])('explains a %s %s failure and clicks nothing', async (status, errorCode, expected) => {
      await mountWithFile();
      button('Download: slides.pdf')?.click();
      await settle();
      await answer(`${SESSION_URL}/a1/download`, { title: 'English', errorCode }, { status, statusText: 'err' });

      expect(alerts().join(' ')).toContain(expected);
      expect(anchorClick).not.toHaveBeenCalled();
      expect(button('Download: slides.pdf')?.disabled).toBe(false);
    });

    it('still reports a failed download in quiet mode (the learner asked for it)', async () => {
      await mountWithFile(true);
      button('Download: slides.pdf')?.click();
      await settle();
      await answer(`${SESSION_URL}/a1/download`, {}, { status: 503, statusText: 'err' });
      expect(alerts().join(' ')).toContain('File storage is temporarily unavailable.');
    });

    it('refuses a download URL that is not http(s)', async () => {
      await mountWithFile();
      button('Download: slides.pdf')?.click();
      await settle();
      await answer(`${SESSION_URL}/a1/download`, download('a1', 'slides.pdf', 'javascript:alert(1)'));
      expect(anchorClick).not.toHaveBeenCalled();
      expect(alerts().join(' ')).toContain('Something went wrong');
    });

    it('clears an earlier download error when the learner tries again', async () => {
      await mountWithFile();
      button('Download: slides.pdf')?.click();
      await settle();
      await answer(`${SESSION_URL}/a1/download`, {}, { status: 503, statusText: 'err' });
      expect(alerts().length).toBe(1);

      button('Download: slides.pdf')?.click();
      await settle();
      expect(alerts()).toEqual([]);
      await answer(`${SESSION_URL}/a1/download`, download('a1', 'slides.pdf', URL_1));
      expect(anchorClick).toHaveBeenCalledTimes(1);
    });
  });
});
