import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { PagedResult } from '../../../core/http/paged-result.model';
import { BannerItem } from '../../cms/data/cms-api.models';
import { AdminBannersPage } from './admin-banners-page';

const MOCK_BANNERS: PagedResult<BannerItem> = {
  items: [
    {
      id: 'b-1',
      title: 'คอร์สแนะนำเดือนนี้ ลดสูงสุด 50%',
      imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3',
      targetUrl: '/courses',
      sortOrder: 1,
      isActive: true,
      startsAtUtc: null,
      endsAtUtc: null,
      createdAtUtc: '2026-08-01T00:00:00Z',
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

describe('AdminBannersPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/banners', component: AdminBannersPage }]),
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

  async function navigate(): Promise<AdminBannersPage> {
    const component = await harness.navigateByUrl('/admin/banners', AdminBannersPage);
    await settle();
    return component;
  }

  it('renders banners list from CMS API', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/banners'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_BANNERS);
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('จัดการแบนเนอร์หน้าแรก');
    expect(text).toContain('คอร์สแนะนำเดือนนี้ ลดสูงสุด 50%');
    expect(text).toContain('เปิดใช้งาน');
  });

  it('adds a new banner through form and reloads list', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/banners'));
    req.flush(MOCK_BANNERS);
    await settle();

    // Click "เพิ่มแบนเนอร์ใหม่"
    const addBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('เพิ่มแบนเนอร์ใหม่')
    );
    expect(addBtn).toBeDefined();
    addBtn?.click();
    await settle();

    // Fill inputs
    const inputs = harness.routeNativeElement?.querySelectorAll('input') ?? [];
    const titleInput = inputs[0] as HTMLInputElement;
    const imgInput = inputs[1] as HTMLInputElement;

    titleInput.value = 'Mid Year Mega Sale';
    titleInput.dispatchEvent(new Event('input'));
    imgInput.value = 'https://example.com/banner.jpg';
    imgInput.dispatchEvent(new Event('input'));
    await settle();

    // Save
    const saveBtn = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('บันทึกแบนเนอร์')
    );
    expect(saveBtn).toBeDefined();
    saveBtn?.click();
    await settle();

    const createReq = httpMock.expectOne('/api/cms/admin/banners');
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body.title).toBe('Mid Year Mega Sale');
    createReq.flush({
      id: 'b-2',
      title: 'Mid Year Mega Sale',
      imageUrl: 'https://example.com/banner.jpg',
      targetUrl: null,
      sortOrder: 2,
      isActive: true,
      startsAtUtc: null,
      endsAtUtc: null,
      createdAtUtc: new Date().toISOString(),
    });
    await settle();

    const reloadReq = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/banners'));
    reloadReq.flush(MOCK_BANNERS);
    await settle();
  });

  it('deletes a banner and reloads list', async () => {
    await navigate();
    const req = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/banners'));
    req.flush(MOCK_BANNERS);
    await settle();

    const deleteBtn = harness.routeNativeElement?.querySelector('button[title="ลบแบนเนอร์"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    deleteBtn.click();
    await settle();

    const delReq = httpMock.expectOne('/api/cms/admin/banners/b-1');
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush(null);
    await settle();

    const reloadReq = httpMock.expectOne((r) => r.url.startsWith('/api/cms/admin/banners'));
    reloadReq.flush({ items: [], totalCount: 0, page: 1, pageSize: 50, totalPages: 0 });
    await settle();
  });
});
