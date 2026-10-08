import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { PostItem } from '../../cms/data/cms-api.models';
import { PagedResponse } from '../../cms/data/cms-api.service';
import { BlogListPage } from './blog-list-page';

const POST: PostItem = {
  id: 'post-1',
  title: 'Understanding Angular Signals',
  slug: 'understanding-angular-signals',
  excerpt: 'A deep dive into signals and reactive primitives.',
  contentHtml: '<p>Real article content.</p>',
  coverImageUrl: 'https://example.com/cover.jpg',
  authorId: 'author-1',
  status: 'Published',
  publishedAtUtc: '2026-08-01T00:00:00Z',
  seoTitle: null,
  seoDescription: null,
  createdAtUtc: '2026-08-01T00:00:00Z',
};

const ONE_POST_RESPONSE: PagedResponse<PostItem> = { items: [POST], totalCount: 1, page: 1, pageSize: 20 };
const EMPTY_RESPONSE: PagedResponse<PostItem> = { items: [], totalCount: 0, page: 1, pageSize: 20 };

describe('BlogListPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'blog', component: BlogListPage }]),
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

  async function navigate(): Promise<BlogListPage> {
    const component = await harness.navigateByUrl('/blog', BlogListPage);
    await settle();
    return component;
  }

  async function flushPosts(response: PagedResponse<PostItem> = EMPTY_RESPONSE, status = 200): Promise<void> {
    const req = httpMock.expectOne((r) => r.url === '/api/cms/posts');
    if (status === 200) {
      req.flush(response);
    } else {
      req.flush({ title: 'Server Error' }, { status, statusText: 'Error' });
    }
    await settle();
  }

  it('shows a skeleton grid (no fabricated posts) while the list is still loading', async () => {
    await navigate();

    expect(harness.routeNativeElement?.querySelector('[aria-busy="true"]')).not.toBeNull();
    // The old fabricated defaults' own titles — must never appear, not even transiently while loading.
    expect(harness.routeNativeElement?.textContent).not.toContain('AI Software Engineer');
    expect(harness.routeNativeElement?.textContent).not.toContain('Clean Architecture');

    await flushPosts();
  });

  it('shows a real empty state (not fabricated posts) when the API returns zero posts', async () => {
    await navigate();
    await flushPosts(EMPTY_RESPONSE);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('No articles yet');
    expect(text).not.toContain('AI Software Engineer');
  });

  it('renders the real post once loaded, linking to /blog/{slug}', async () => {
    await navigate();
    await flushPosts(ONE_POST_RESPONSE);

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Understanding Angular Signals');

    const link = harness.routeNativeElement?.querySelector('a[href="/blog/understanding-angular-signals"]');
    expect(link).not.toBeNull();
  });

  it('derives the reading time from the post body and omits it when there is no readable text', async () => {
    await navigate();
    await flushPosts({
      ...ONE_POST_RESPONSE,
      items: [POST, { ...POST, id: 'post-2', slug: 'no-body', title: 'No body post', contentHtml: '<p>&nbsp;</p>' }],
      totalCount: 2,
    });

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text.match(/1 min read/g)?.length).toBe(1);
    expect(text).not.toContain('5 min read');
  });

  it('shows a real error state (not fabricated posts) on failure, and retry re-fetches the real list', async () => {
    await navigate();
    await flushPosts(EMPTY_RESPONSE, 500);

    let text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain("Couldn't load articles");
    expect(text).not.toContain('AI Software Engineer');

    const retryButton = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Try again',
    ) as HTMLButtonElement;
    expect(retryButton).toBeTruthy();
    retryButton.click();
    await settle();

    await flushPosts(ONE_POST_RESPONSE);

    text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Understanding Angular Signals');
  });
});
