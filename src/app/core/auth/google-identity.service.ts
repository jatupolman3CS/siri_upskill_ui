import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** The slice of Google Identity Services (`google.accounts.id`) this app uses. */
export interface GoogleIdentityApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
      locale?: string;
    },
  ): void;
}

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/**
 * Loads Google's "Sign in with Google" script on demand (browser only — callers run it from
 * `afterNextRender`) and hands back the `google.accounts.id` API. The script is added once and
 * shared by every button on the page; a failed load clears the cache so the next attempt retries.
 */
@Injectable({ providedIn: 'root' })
export class GoogleIdentityService {
  private readonly document = inject(DOCUMENT);
  private loading: Promise<GoogleIdentityApi> | null = null;

  load(): Promise<GoogleIdentityApi> {
    this.loading ??= this.injectScript().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private injectScript(): Promise<GoogleIdentityApi> {
    const existing = this.api();
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise<GoogleIdentityApi>((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        const api = this.api();
        if (api) {
          resolve(api);
        } else {
          reject(new Error('Google Identity Services loaded without google.accounts.id'));
        }
      };
      script.onerror = () => reject(new Error('Google Identity Services failed to load'));
      this.document.head.appendChild(script);
    });
  }

  private api(): GoogleIdentityApi | undefined {
    const view = this.document.defaultView as
      | (Window & { google?: { accounts?: { id?: GoogleIdentityApi } } })
      | null;
    return view?.google?.accounts?.id;
  }
}
