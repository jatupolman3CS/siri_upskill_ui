import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { GoogleIdentityService } from '../../../core/auth/google-identity.service';
import { resolvePostLoginUrl } from '../../../core/auth/post-login-route';
import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AuthApiService } from '../data/auth-api.service';

const MAX_BUTTON_WIDTH = 400; // Google Identity Services accepts 200–400 px
const MIN_BUTTON_WIDTH = 200;

/**
 * "Sign in with Google" button (Google Identity Services, ID-token flow).
 *
 * Renders nothing unless the API reports a Google client id (`GET /api/auth/oauth-clients`), so the
 * button never shows on a server where Google sign-in is switched off. Everything here runs in the
 * browser only (`afterNextRender`); SSR emits an empty host. When Google hands back a credential the
 * API verifies it and answers exactly like `/login` (access token in the body, refresh token in the
 * httpOnly cookie), after which the user is sent to their `returnUrl` or their role's home.
 */
@Component({
  selector: 'app-google-sign-in',
  imports: [TranslatePipe],
  templateUrl: './google-sign-in.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class GoogleSignIn {
  /** Wording on Google's button: "Sign in with Google" vs "Sign up with Google". */
  readonly mode = input<'signin' | 'signup'>('signin');
  /** i18n key of a divider line rendered under the button; omit when the page has its own. */
  readonly dividerKey = input<string | null>(null);

  private readonly authApi = inject(AuthApiService);
  private readonly authService = inject(AuthService);
  private readonly googleIdentity = inject(GoogleIdentityService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translation = inject(TranslationService);

  private readonly buttonHost = viewChild<ElementRef<HTMLElement>>('buttonHost');

  protected readonly clientId = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  private renderedClientId: string | null = null;

  constructor() {
    afterNextRender(() => {
      void this.loadClientId();
    });

    afterRenderEffect(() => {
      const clientId = this.clientId();
      const host = this.buttonHost()?.nativeElement;
      if (clientId && host && this.renderedClientId !== clientId) {
        this.renderedClientId = clientId;
        void this.renderButton(clientId, host);
      }
    });
  }

  private async loadClientId(): Promise<void> {
    try {
      const clients = await firstValueFrom(this.authApi.getOAuthClients());
      this.clientId.set(clients.google?.clientId ?? null);
    } catch {
      // API unreachable or older than this feature: no button is better than one that cannot work.
      this.clientId.set(null);
    }
  }

  private async renderButton(clientId: string, host: HTMLElement): Promise<void> {
    try {
      const google = await this.googleIdentity.load();
      google.initialize({
        client_id: clientId,
        callback: (response) => this.onCredential(response.credential),
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      google.renderButton(host, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        logo_alignment: 'left',
        text: this.mode() === 'signup' ? 'signup_with' : 'signin_with',
        locale: this.translation.locale(),
        width: Math.min(MAX_BUTTON_WIDTH, Math.max(MIN_BUTTON_WIDTH, Math.round(host.clientWidth))),
      });
    } catch {
      // Script blocked (ad blocker, offline): drop the section rather than leave an empty gap.
      this.clientId.set(null);
    }
  }

  private onCredential(idToken: string | undefined): void {
    if (!idToken || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authApi.googleLogin({ idToken }).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.authService.setAccessToken(response.accessToken);
        const roles = this.authService.currentUser()?.roles ?? [];
        void this.router.navigateByUrl(resolvePostLoginUrl(this.route.snapshot.queryParams['returnUrl'], roles));
      },
      error: (error: ApiError) => {
        this.submitting.set(false);
        this.errorMessage.set(error.message === 'common.error' ? this.translation.t('common.error') : error.message);
      },
    });
  }
}
