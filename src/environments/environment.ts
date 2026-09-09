export const environment = {
  production: true,
  /**
   * Where API calls go — `core/http/api-base-url.interceptor.ts` prefixes every relative
   * `/api/...` request with it. Caddy routes browser requests on the same origin.
   * SSR uses API_INTERNAL_URL through the server-only API_BASE_URL provider.
   */
  apiUrl: 'https://api-siriupskill.siristudiophoto.com/',
  /** Optional fallback; prefer `GET /api/auth/oauth-clients` from the API. */
 googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
  /** DEV-BYPASS: never on in a production build — real sign-in only. */
  devAuth: {
    bypass: false,
    role: 'buyer' as 'buyer' | 'seller' | 'admin',
  },
};
