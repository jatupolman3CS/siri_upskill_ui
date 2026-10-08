import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { resolvePostLoginUrl } from '../../../core/auth/post-login-route';
import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { Button } from '../../../shared/button/button';
import { InputField } from '../../../shared/input/input';
import { AuthApiService } from '../data/auth-api.service';
import { fieldError } from '../data/field-error.util';
import { GoogleSignIn } from '../google-sign-in/google-sign-in';
import { validationMessage } from '../validation-message.util';

const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 256;

interface LoginForm {
  email: FormControl<string>;
  password: FormControl<string>;
}

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, InputField, Button, GoogleSignIn],
  templateUrl: './login-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly authApi = inject(AuthApiService);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly translation = inject(TranslationService);

  private readonly errorSummary = viewChild<ElementRef<HTMLElement>>('errorSummary');

  protected readonly form = new FormGroup<LoginForm>({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(MAX_EMAIL_LENGTH)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(MAX_PASSWORD_LENGTH)],
    }),
  });

  protected readonly submitting = signal(false);
  protected readonly apiError = signal<ApiError | null>(null);
  protected readonly showClientErrorSummary = signal(false);

  private readonly focusRequestId = signal(0);
  private lastFocusedRequestId = 0;

  constructor() {
    setPageMeta({
      title: `${this.translation.t('auth.login.pageTitle')} · ${this.translation.t('common.appName')}`,
      description: this.translation.t('auth.login.pageDescription'),
    });

    afterRenderEffect(() => {
      const requestId = this.focusRequestId();
      if (requestId !== this.lastFocusedRequestId) {
        this.lastFocusedRequestId = requestId;
        this.errorSummary()?.nativeElement.focus();
      }
    });
  }

  protected emailError(): string | undefined {
    return validationMessage(this.form.controls.email, this.translation) ?? fieldError(this.apiError(), 'Email');
  }

  protected passwordError(): string | undefined {
    return validationMessage(this.form.controls.password, this.translation) ?? fieldError(this.apiError(), 'Password');
  }

  protected formLevelError(): string | null {
    const error = this.apiError();
    if (!error) {
      return null;
    }
    if (fieldError(error, 'Email') || fieldError(error, 'Password')) {
      return null;
    }
    return error.message === 'common.error' ? this.translation.t('common.error') : error.message;
  }

  protected onSubmit(): void {
    if (this.submitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.showClientErrorSummary.set(true);
      this.apiError.set(null);
      this.focusRequestId.update((n) => n + 1);
      return;
    }

    this.showClientErrorSummary.set(false);
    this.apiError.set(null);
    this.submitting.set(true);

    const { email, password } = this.form.getRawValue();

    this.authApi.login({ email, password }).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.authService.setAccessToken(response.accessToken);
        const roles = this.authService.currentUser()?.roles ?? [];
        void this.router.navigateByUrl(resolvePostLoginUrl(this.route.snapshot.queryParams['returnUrl'], roles));
      },
      error: (error: ApiError) => {
        this.submitting.set(false);
        this.apiError.set(error);
        this.focusRequestId.update((n) => n + 1);
      },
    });
  }
}
