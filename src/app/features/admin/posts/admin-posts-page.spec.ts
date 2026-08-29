import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { PagedResult } from '../../../core/http/paged-result.model';
import { PostItem } from '../../cms/data/cms-api.models';
import { AdminPostsPage } from './admin-posts-page';

const MOCK_POSTS: PagedResult<PostItem> = {
  items: [
    {
      id: 'p-1',
      title: '5 ทักษะสำคัญในการเป็น AI Software Engineer',
      slug: '5-skills-ai-engineer',
      excerpt: 'เจาะลึกเทคโนโลยีที่นักพัฒนาต้องรู้',
      contentHtml: '<p>Content</p>',
      coverImageUrl: 'https://example.com/post.jpg',
      authorId: 'admin',
      status: 'Published',
      publishedAtUtc: '2026-08-01T00:00:00Z',
      seoTitle: null,
      seoDescription: null,
      createdAtUtc: '2026-08-01T00:00:00Z',
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

describe('AdminPostsPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/posts', component: AdminPostsPage }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
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

  async function navigate(): Promise<AdminPostsPage> {
    const component = await harness.navigateByUrl('/admin/posts', AdminPostsPage);
    await settle();
    return component;
  }

  it('renders posts list from CMS API', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/posts'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_POSTS);
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('บทความและข่าวสาร');
    expect(text).toContain('5 ทักษะสำคัญในการเป็น AI Software Engineer');
  });

  it('creates a new post through form and reloads list', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/posts'));
    req.flush(MOCK_POSTS);
    await settle();

    // Click "เขียนบทความใหม่"
    const addBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('เขียนบทความใหม่')
    );
    expect(addBtn).toBeDefined();
    addBtn?.click();
    await settle();

    // Fill title
    const inputs = harness.routeNativeElement?.querySelectorAll('input') ?? [];
    const titleInput = inputs[0] as HTMLInputElement;
    titleInput.value = 'Clean Architecture Guide';
    titleInput.dispatchEvent(new Event('input'));
    await settle();

    // Save
    const saveBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('เผยแพร่บทความ')
    );
    expect(saveBtn).toBeDefined();
    saveBtn?.click();
    await settle();

    const createReq = httpMock.expectOne('/api/cms/admin/posts');
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body.title).toBe('Clean Architecture Guide');
    createReq.flush({
      id: 'p-2',
      title: 'Clean Architecture Guide',
      slug: 'clean-architecture-guide',
      excerpt: null,
      contentHtml: '<p>Clean Architecture Guide</p>',
      coverImageUrl: null,
      authorId: 'admin',
      status: 'Published',
      publishedAtUtc: new Date().toISOString(),
      seoTitle: 'Clean Architecture Guide',
      seoDescription: null,
      createdAtUtc: new Date().toISOString(),
    });
    await settle();

    const reloadReq = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/posts'));
    reloadReq.flush(MOCK_POSTS);
    await settle();
  });

  it('deletes a post and reloads list', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/posts'));
    req.flush(MOCK_POSTS);
    await settle();

    const deleteBtn = harness.routeNativeElement?.querySelector('button[title="ลบบทความ"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    deleteBtn.click();
    await settle();

    const delReq = httpMock.expectOne('/api/cms/admin/posts/p-1');
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush(null);
    await settle();

    const reloadReq = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/posts'));
    reloadReq.flush({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 });
    await settle();
  });
});
