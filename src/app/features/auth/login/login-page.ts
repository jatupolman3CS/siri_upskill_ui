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
import { Router, RouterLink } from '@angular/router';

import { AuthService, UserRole } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { setPageMeta } from '../../../core/seo/page-meta';
import { environment } from '../../../../environments/environment';
import { Button } from '../../../shared/button/button';
import { InputField } from '../../../shared/input/input';
import { AuthApiService } from '../data/auth-api.service';
import { fieldError } from '../data/field-error.util';
import { validationMessage } from '../validation-message.util';

const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 256;

interface LoginForm {
  email: FormControl<string>;
  password: FormControl<string>;
}

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, InputField, Button],
  templateUrl: './login-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly authApi = inject(AuthApiService);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
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

  /** DEV-BYPASS: `false` in every production build — hides the quick-bypass box below. */
  protected readonly devBypassEnabled = environment.devAuth.bypass;

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

  /**
   * One-click bypass login directly into any role
   */
  protected quickBypass(role: UserRole): void {
    this.authService.setBypassRole(role);
    let target = '/';
    if (role === 'SuperAdmin' || role === 'Admin') {
      target = '/admin';
    } else if (role === 'Instructor') {
      target = '/instructor';
    } else if (role === 'Learner') {
      target = '/my-courses';
    }
    void this.router.navigateByUrl(target);
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
        void this.router.navigateByUrl('/account/devices');
      },
      error: (error: ApiError) => {
        this.submitting.set(false);
        this.apiError.set(error);
        this.focusRequestId.update((n) => n + 1);
      },
    });
  }
}
