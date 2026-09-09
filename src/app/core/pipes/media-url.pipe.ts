import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Resolves relative media and file storage keys (e.g. "courses/thumbnails/xyz.webp" or "/uploads/...")
 * against the configured mediaBaseUrl (or apiUrl fallback).
 *
 * If the input is already an absolute URL (starts with http://, https://, data:, or blob:),
 * it returns the URL unchanged.
 *
 * This ensures that database records only need to store relative paths (clean & portable),
 * while the base domain / CDN can be changed dynamically in environment configs without database migrations.
 */
@Pipe({
  name: 'mediaUrl',
  standalone: true,
})
export class MediaUrlPipe implements PipeTransform {
  transform(value: string | null | undefined, fallback?: string): string {
    if (!value || !value.trim()) {
      return fallback || '';
    }

    const trimmed = value.trim();

    // If it's already an absolute URL or data/blob URI, return as-is
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }

    // Resolve base URL directly from environment.apiUrl
    const baseUrl = environment.apiUrl || '';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

    return `${cleanBase}${cleanPath}`;
  }
}
