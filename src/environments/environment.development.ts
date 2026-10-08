export const environment = {
  production: false,
  /**
   * The one knob that decides where API calls go — `core/http/api-base-url.interceptor.ts`
   * prefixes every relative `/api/...` request with it.
   *
   * Browser requests use proxy.conf.json to reach localhost:5190 on the same origin.
   * SSR resolves API_BASE_URL from API_INTERNAL_URL, defaulting to localhost:5190.
   */
  apiUrl: '',
  /** Public client id; the API's `GET /api/auth/oauth-clients` takes precedence when set. */
  googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
};
