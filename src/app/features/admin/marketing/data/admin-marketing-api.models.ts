import { PagedResult } from '../../../../core/http/paged-result.model';

export type PromoCodeDiscountType = 'Fixed' | 'Percentage';

export interface PromoCodeItem {
  id: string;
  code: string;
  discountType: PromoCodeDiscountType;
  discountValue: number;
  maxRedemptions: number;
  redeemedCount: number;
  maxPerUser: number;
  minOrderAmount: number;
  startsAtUtc: string;
  endsAtUtc: string;
  scope: number | string;
  scopeRefId: string | null;
  isActive: boolean;
}

export interface CreatePromoCodeRequest {
  code: string;
  discountType: PromoCodeDiscountType;
  discountValue: number;
  maxRedemptions: number;
  maxPerUser: number;
  minOrderAmount: number;
  startsAtUtc: string;
  endsAtUtc: string;
  scope?: number;
  scopeRefId?: string | null;
}

export interface FlashSaleItem {
  id: string;
  courseId: string;
  salePrice: number;
}

export interface FlashSaleResponse {
  id: string;
  title: string;
  startsAtUtc: string;
  endsAtUtc: string;
  isActive: boolean;
  items: readonly FlashSaleItem[];
}

export interface CreateFlashSaleItemRequest {
  courseId: string;
  salePrice: number;
}

export interface CreateFlashSaleRequest {
  title: string;
  startsAtUtc: string;
  endsAtUtc: string;
  items: readonly CreateFlashSaleItemRequest[];
}

export interface BundleItem {
  courseId: string;
}

export interface BundleResponse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number;
  isActive: boolean;
  startsAtUtc: string | null;
  endsAtUtc: string | null;
  items: readonly BundleItem[];
}

export interface CreateBundleRequest {
  slug: string;
  title: string;
  description: string | null;
  price: number;
  courseIds: readonly string[];
}

export type PagedPromoCodes = PagedResult<PromoCodeItem>;
export type PagedFlashSales = PagedResult<FlashSaleResponse>;
export type PagedBundles = PagedResult<BundleResponse>;
