import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  BundleResponse,
  CreateBundleRequest,
  CreateFlashSaleRequest,
  CreatePromoCodeRequest,
  FlashSaleResponse,
  PagedBundles,
  PagedFlashSales,
  PagedPromoCodes,
  PromoCodeItem,
} from './admin-marketing-api.models';

@Injectable({ providedIn: 'root' })
export class AdminMarketingApiService {
  private readonly http = inject(HttpClient);

  // Promo Codes
  getPromoCodes(page = 1, pageSize = 50): Observable<PagedPromoCodes> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedPromoCodes>('/api/commerce/admin/promo-codes', { params });
  }

  createPromoCode(request: CreatePromoCodeRequest): Observable<PromoCodeItem> {
    return this.http.post<PromoCodeItem>('/api/commerce/admin/promo-codes', request);
  }

  // Flash Sales
  getFlashSales(page = 1, pageSize = 50): Observable<PagedFlashSales> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedFlashSales>('/api/commerce/flash-sales', { params });
  }

  createFlashSale(request: CreateFlashSaleRequest): Observable<FlashSaleResponse> {
    return this.http.post<FlashSaleResponse>('/api/commerce/admin/flash-sales', request);
  }

  // Bundles
  getBundles(page = 1, pageSize = 50): Observable<PagedBundles> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedBundles>('/api/commerce/bundles', { params });
  }

  createBundle(request: CreateBundleRequest): Observable<BundleResponse> {
    return this.http.post<BundleResponse>('/api/commerce/admin/bundles', request);
  }
}
