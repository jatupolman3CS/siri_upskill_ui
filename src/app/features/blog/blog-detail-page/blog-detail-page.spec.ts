import { DOCUMENT } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { PostItem } from '../../cms/data/cms-api.models';
import { BlogDetailPage } from './blog-detail-page';

const POST: PostItem = {
  id: 'post-1',
  title: 'Understanding Angular Signals',
  slug: 'understanding-angular-signals',
  excerpt: 'A deep dive into signals and reactive primitives.',
  contentHtml: '<p>Real article content fetched from the API.</p>',
  coverImageUrl: 'https://example.com/cover.jpg',
  authorId: 'author-1',
  status: 'Published',
  publishedAtUtc: '2026-08-01T00:00:00Z',
  seoTitle: null,
  seoDescription: null,
  createdAtUtc: '2026-08-01T00:00:00Z',
};

describe('BlogDetailPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'blog/:slug', component: BlogDetailPage }]),
        // withFetch() — matches app.config.ts's real HTTP client setup, needed to reliably reproduce
        // rxResource's error state (see CourseDetailPage's own spec for why plain provideHttpClient()'s
        // XHR default isn't equivalent here).
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    harness.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    harness.detectChanges();
  }

  async function navigate(url: string): Promise<BlogDetailPage> {
    const component = await harness.navigateByUrl(url, BlogDetailPage);
    await settle();
    return component;
  }

  async function flushPost(response: PostItem | null, slug = 'understanding-angular-signals', status = 200): Promise<void> {
    const req = httpMock.expectOne((r) => r.url === `/api/cms/posts/${slug}`);
    if (status === 200) {
      req.flush(response);
    } else {
      req.flush({ title: 'Not Found', detail: 'Post not found' }, { status, statusText: 'Error' });
    }
    await settle();
  }

  it('shows a busy skeleton with no article content while the post is still loading', async () => {
    await navigate('/blog/understanding-angular-signals');

    expect(harness.routeNativeElement?.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Understanding Angular Signals');

    await flushPost(POST);
  });

  it('renders the real article once loaded — never a fabricated fallback article', async () => {
    await navigate('/blog/understanding-angular-signals');
    await flushPost(POST);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Understanding Angular Signals');
    expect(text).toContain('A deep dive into signals and reactive primitives.');
    // The old fabricated fallback article's own title — must never appear, on any slug or failure mode.
    expect(text).not.toContain('AI Software Engineer');
  });

  it('shows a real not-found state (not a fabricated article) on a 404, with a link back to /blog', async () => {
    await navigate('/blog/does-not-exist');
    await flushPost(null, 'does-not-exist', 404);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Article not found');
    expect(text).not.toContain("Couldn't load this article");
    expect(text).not.toContain('AI Software Engineer');

    const backLink = harness.routeNativeElement?.querySelector('a[href="/blog"]');
    expect(backLink).not.toBeNull();
  });

  it('shows a real error state (not a fabricated article) on a non-404 failure, and retry re-fetches the real post', async () => {
    await navigate('/blog/understanding-angular-signals');
    await flushPost(null, 'understanding-angular-signals', 500);

    let text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain("Couldn't load this article");
    expect(text).not.toContain('Article not found');
    expect(text).not.toContain('AI Software Engineer');

    const retryButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Try again',
    ) as HTMLButtonElement;
    expect(retryButton).toBeTruthy();
    retryButton.click();
    await settle();

    await flushPost(POST);

    text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Understanding Angular Signals');
  });

  it('sets robots=noindex on a 404 (not-found pages must not be indexed)', async () => {
    await navigate('/blog/does-not-exist');
    await flushPost(null, 'does-not-exist', 404);

    const document = TestBed.inject(DOCUMENT);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('sets robots=noindex on a non-404 failure too', async () => {
    await navigate('/blog/understanding-angular-signals');
    await flushPost(null, 'understanding-angular-signals', 500);

    const document = TestBed.inject(DOCUMENT);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  describe('share button', () => {
    function shareButton(): HTMLButtonElement {
      return Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Share article'),
      ) as HTMLButtonElement;
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('uses the native share sheet with the canonical article URL when the browser has one', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, share });
      await navigate('/blog/understanding-angular-signals');
      await flushPost(POST);

      shareButton().click();
      await settle();

      expect(share).toHaveBeenCalledWith({
        title: 'Understanding Angular Signals',
        url: `${window.location.origin}/blog/understanding-angular-signals`,
      });
    });

    it('copies the URL and confirms with a toast when the native share sheet is unavailable', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      await navigate('/blog/understanding-angular-signals');
      await flushPost(POST);

      shareButton().click();
      await settle();
      await Promise.resolve();

      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/blog/understanding-angular-signals`);
      const messages = TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.message);
      expect(messages).toContain('Article link copied');
    });

    it('shows an error toast when copying is not possible either', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
      await navigate('/blog/understanding-angular-signals');
      await flushPost(POST);

      shareButton().click();
      await settle();
      await Promise.resolve();

      const toast = TestBed.inject(ToastService)
        .toasts()
        .find((t) => t.type === 'error');
      expect(toast?.message).toContain('Could not copy the link');
    });
  });
});
