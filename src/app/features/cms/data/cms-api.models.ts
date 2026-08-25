export type PostStatus = 'Draft' | 'Published' | 'Archived';

export interface BannerItem {
  readonly id: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly startsAtUtc: string | null;
  readonly endsAtUtc: string | null;
  readonly createdAtUtc: string;
}

export interface CreateBannerRequest {
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl?: string | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface PostItem {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string | null;
  readonly contentHtml: string;
  readonly coverImageUrl: string | null;
  readonly authorId: string;
  readonly status: PostStatus;
  readonly publishedAtUtc: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly createdAtUtc: string;
}

export interface CreatePostRequest {
  readonly title: string;
  readonly slug: string;
  readonly excerpt?: string | null;
  readonly contentHtml: string;
  readonly coverImageUrl?: string | null;
  readonly authorId: string;
  readonly status?: PostStatus;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
}
