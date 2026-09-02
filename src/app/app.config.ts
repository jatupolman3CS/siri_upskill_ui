import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { apiBaseUrlInterceptor } from './core/http/api-base-url.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';

registerLocaleData(localeTh);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return firstValueFrom(authService.initSession());
    }),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withFetch(), withInterceptors([apiBaseUrlInterceptor, authInterceptor, errorInterceptor])),
    CurrencyPipe,
    DatePipe,
  ],
};
