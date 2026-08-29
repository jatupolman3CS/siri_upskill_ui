import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { PagedBundles, PagedFlashSales, PagedPromoCodes } from './data/admin-marketing-api.models';
import { AdminMarketingPage } from './admin-marketing-page';

registerLocaleData(localeTh);

const MOCK_PROMOS: PagedPromoCodes = {
  items: [
    {
      id: 'pr-1',
      code: 'SIRI2026',
      discountType: 'Percentage',
      discountValue: 20,
      minOrderAmount: 1000,
      redeemedCount: 15,
      maxRedemptions: 100,
      maxPerUser: 1,
      startsAtUtc: '2026-01-01T00:00:00Z',
      endsAtUtc: '2026-12-31T23:59:59Z',
      scope: 0,
      scopeRefId: null,
      isActive: true,
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const MOCK_FLASH_SALES: PagedFlashSales = {
  items: [
    {
      id: 'fs-1',
      title: 'Flash Sale 24h',
      startsAtUtc: '2026-08-01T00:00:00Z',
      endsAtUtc: '2026-08-02T00:00:00Z',
      isActive: true,
      items: [
        {
          id: 'fsi-1',
          courseId: 'c1111111-1111-1111-1111-111111111111',
          salePrice: 490,
        },
      ],
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const MOCK_BUNDLES: PagedBundles = {
  items: [
    {
      id: 'b-1',
      slug: 'ai-bundle',
      title: 'AI Engineer 3-in-1',
      description: 'Complete package',
      price: 1990,
      isActive: true,
      startsAtUtc: null,
      endsAtUtc: null,
      items: [
        { courseId: 'c1111111-1111-1111-1111-111111111111' },
      ],
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

describe('AdminMarketingPage', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        CurrencyPipe,
        provideRouter([{ path: 'admin/marketing', component: AdminMarketingPage }]),
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

  async function navigate(): Promise<AdminMarketingPage> {
    const component = await harness.navigateByUrl('/admin/marketing', AdminMarketingPage);
    await settle();
    return component;
  }

  function flushInitialRequests(): void {
    const promoReq = httpMock.expectOne((r) => r.url === '/api/commerce/admin/promo-codes');
    expect(promoReq.request.method).toBe('GET');
    promoReq.flush(MOCK_PROMOS);

    const flashReq = httpMock.expectOne((r) => r.url === '/api/commerce/flash-sales');
    expect(flashReq.request.method).toBe('GET');
    flashReq.flush(MOCK_FLASH_SALES);

    const bundleReq = httpMock.expectOne((r) => r.url === '/api/commerce/bundles');
    expect(bundleReq.request.method).toBe('GET');
    bundleReq.flush(MOCK_BUNDLES);
  }

  it('renders marketing promo codes list correctly from API', async () => {
    await navigate();
    flushInitialRequests();
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('การตลาดและโปรโมชัน');
    expect(text).toContain('SIRI2026');
    expect(text).toContain('ลด 20%');
    expect(text).toContain('15 / 100 ครั้ง');
  });

  it('switches tabs and displays flash sales and bundles', async () => {
    const component = await navigate();
    flushInitialRequests();
    await settle();

    // Switch to Flash Sales
    const buttons = harness.routeNativeElement?.querySelectorAll('button') ?? [];
    const flashTabBtn = Array.from(buttons).find((b) => b.textContent?.includes('แฟลชเซล'));
    expect(flashTabBtn).toBeDefined();
    flashTabBtn?.click();
    await settle();

    let text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Flash Sale 24h');

    // Switch to Bundles
    const bundleTabBtn = Array.from(buttons).find((b) => b.textContent?.includes('ชุดแพ็กเกจ'));
    expect(bundleTabBtn).toBeDefined();
    bundleTabBtn?.click();
    await settle();

    text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('AI Engineer 3-in-1');
    expect(text).toContain('1,990');
  });

  it('submits create promo code modal form to backend', async () => {
    const component = await navigate();
    flushInitialRequests();
    await settle();

    // Open promo modal
    const createBtn = harness.routeNativeElement?.querySelector('button') as HTMLButtonElement;
    expect(createBtn.textContent).toContain('สร้างโค้ดส่วนลด');
    createBtn.click();
    await settle();

    // Fill code
    const input = harness.routeNativeElement?.querySelector('input[name="promoCode"]') as HTMLInputElement;
    input.value = 'NEWYEAR50';
    input.dispatchEvent(new Event('input'));
    await settle();

    // Submit form
    const form = harness.routeNativeElement?.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await settle();

    const createReq = httpMock.expectOne('/api/commerce/admin/promo-codes');
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body.code).toBe('NEWYEAR50');
    createReq.flush({
      id: 'pr-2',
      code: 'NEWYEAR50',
      discountType: 'Percentage',
      discountValue: 15,
      maxRedemptions: 100,
      maxPerUser: 1,
      minOrderAmount: 0,
      startsAtUtc: new Date().toISOString(),
      endsAtUtc: new Date().toISOString(),
      scope: 0,
      scopeRefId: null,
      isActive: true,
    });
    await settle();

    // Refreshes promos list
    const reloadReq = httpMock.expectOne((r) => r.url === '/api/commerce/admin/promo-codes');
    reloadReq.flush(MOCK_PROMOS);
    await settle();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('สร้างโค้ดส่วนลด "NEWYEAR50" สำเร็จแล้ว');
  });
});
