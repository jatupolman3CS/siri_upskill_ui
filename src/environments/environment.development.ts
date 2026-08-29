export const environment = {
  production: false,
  /**
   * The one knob that decides where API calls go — `core/http/api-base-url.interceptor.ts`
   * prefixes every relative `/api/...` request with it.
   *
   * `dotnet run --project src/Siri.Api --launch-profile http` serves the API on :5190 with no path
   * base, and its `Cors:AllowedOrigins` already allows `http://localhost:4200`, so `ng serve` talks
   * to it directly. Leave it empty instead to route through `proxy.conf.json` (same origin, no
   * CORS) — at the cost of SSR data fetches, which have no origin to resolve a relative URL
   * against. Point it at another host to develop against a different backend.
   */
  apiUrl: 'http://localhost:5190',
  /** Public client id; the API's `GET /api/auth/oauth-clients` takes precedence when set. */
  googleOAuthClientId:
    '5881672938-464ssnfcb78tou755dkf7jvmhvbkf68v.apps.googleusercontent.com',
  /**
   * DEV-BYPASS: sign-in is not finished yet, so `bypass: true` walks straight into the app as a
   * seeded account and every guarded page becomes reachable. The API has the matching switch
   * (`Auth:DevBypass:Enabled` in `appsettings.Development.json`) and both must be on together.
   * `role` is the account picked on first load; the floating dev switcher changes it afterwards.
   * Set this to `false` to get the real login flow back.
   */
  devAuth: {
    bypass: true,
    role: 'admin' as 'buyer' | 'seller' | 'admin',
  },
};
