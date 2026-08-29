import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../../environments/environment';

/**
 * Prefixes a same-origin `/api/...` request URL with the configured API host.
 *
 * Exported separately from the interceptor so the rule is testable without standing up an
 * `HttpClient`. Returns `requestUrl` unchanged when there is nothing to do, which lets the
 * interceptor skip the `req.clone()` entirely.
 */
export function resolveApiUrl(requestUrl: string, apiUrl: string): string {
  const origin = apiUrl.trim().replace(/\/+$/, '');
  const isApiPath = requestUrl === '/api' || requestUrl.startsWith('/api/');
  if (!origin || !isApiPath) {
    return requestUrl;
  }

  return `${origin}${requestUrl}`;
}

/**
 * Rewrites relative `/api/...` URLs onto `environment.apiUrl`.
 *
 * Every `*ApiService` writes its paths as `/api/...`, which resolves on its own only while the API
 * shares the app's origin — true under `ng serve` (see `proxy.conf.json`) but not in production,
 * where the API is a separate host, and not during SSR, where a relative URL has no origin to
 * resolve against at all. Doing the rewrite here keeps the deploy-time knob in
 * `src/environments/` rather than spread across every service that hardcodes its own path.
 *
 * A URL that already carries its own origin (an absolute CDN/media URL, for example) is never
 * touched, and the whole interceptor is a passthrough when `apiUrl` is empty.
 */
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const url = resolveApiUrl(req.url, environment.apiUrl);

  return url === req.url ? next(req) : next(req.clone({ url }));
};
