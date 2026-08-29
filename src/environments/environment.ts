export const environment = {
  production: true,
  /**
   * Where API calls go — `core/http/api-base-url.interceptor.ts` prefixes every relative
   * `/api/...` request with it. Empty means "same origin as the app"; an absolute URL (the case
   * here, since the API is its own host) must also be listed in the API's `Cors:AllowedOrigins`
   * the other way round, or the credentialed auth calls are refused by the browser.
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
