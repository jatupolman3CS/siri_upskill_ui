import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  BannerItem,
  CreateBannerRequest,
  CreateMenuItemRequest,
  CreatePostRequest,
  MenuItem,
  PostItem,
  UpdateMenuItemRequest,
} from './cms-api.models';

export interface PagedResponse<T> {
  readonly items: readonly T[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class CmsApiService {
  private readonly http = inject(HttpClient);

  // Public Blog & Banners
  getActiveBanners(placement = 'HomeHero'): Observable<BannerItem[]> {
    const params = new HttpParams().set('placement', placement);
    return this.http.get<BannerItem[]>('/api/cms/banners', { params });
  }

  getPublishedPosts(page = 1, pageSize = 20): Observable<PagedResponse<PostItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<PostItem>>('/api/cms/posts', { params });
  }

  getPublishedPostBySlug(slug: string): Observable<PostItem> {
    return this.http.get<PostItem>(`/api/cms/posts/${slug}`);
  }

  // Admin Banners
  getAdminBanners(page = 1, pageSize = 50): Observable<PagedResponse<BannerItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<BannerItem>>('/api/cms/admin/banners', { params });
  }

  createBanner(req: CreateBannerRequest): Observable<BannerItem> {
    return this.http.post<BannerItem>('/api/cms/admin/banners', req);
  }

  updateBanner(id: string, req: CreateBannerRequest): Observable<BannerItem> {
    return this.http.put<BannerItem>(`/api/cms/admin/banners/${id}`, req);
  }

  deleteBanner(id: string): Observable<void> {
    return this.http.delete<void>(`/api/cms/admin/banners/${id}`);
  }

  // Admin Posts
  getAdminPosts(page = 1, pageSize = 50): Observable<PagedResponse<PostItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResponse<PostItem>>('/api/cms/admin/posts', { params });
  }

  createPost(req: CreatePostRequest): Observable<PostItem> {
    return this.http.post<PostItem>('/api/cms/admin/posts', req);
  }

  updatePost(id: string, req: CreatePostRequest): Observable<PostItem> {
    return this.http.put<PostItem>(`/api/cms/admin/posts/${id}`, req);
  }

  changePostStatus(id: string, status: string): Observable<PostItem> {
    return this.http.put<PostItem>(`/api/cms/admin/posts/${id}/status`, { status });
  }

  deletePost(id: string): Observable<void> {
    return this.http.delete<void>(`/api/cms/admin/posts/${id}`);
  }

  // Admin Menu Items
  getAdminMenuItems(): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>('/api/cms/admin/menu-items');
  }

  createMenuItem(req: CreateMenuItemRequest): Observable<MenuItem> {
    return this.http.post<MenuItem>('/api/cms/admin/menu-items', req);
  }

  updateMenuItem(id: string, req: UpdateMenuItemRequest): Observable<MenuItem> {
    return this.http.put<MenuItem>(`/api/cms/admin/menu-items/${id}`, req);
  }

  deleteMenuItem(id: string): Observable<void> {
    return this.http.delete<void>(`/api/cms/admin/menu-items/${id}`);
  }
}
