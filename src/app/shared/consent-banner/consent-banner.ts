import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCookie } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../core/i18n/translate.pipe';

export interface CookieConsent {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

const STORAGE_KEY = 'siri_pdpa_consent';

@Component({
  selector: 'app-consent-banner',
  imports: [FormsModule, RouterLink, NgIcon, TranslatePipe],
  templateUrl: './consent-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCookie })],
})
export class ConsentBanner {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly isVisible = signal(false);
  readonly showDetails = signal(false);

  readonly analyticsConsent = signal(true);
  readonly marketingConsent = signal(false);

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      this.isVisible.set(true);
    }
  }

  acceptAll(): void {
    this.saveConsent({
      essential: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString(),
    });
  }

  rejectNonEssential(): void {
    this.saveConsent({
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    });
  }

  saveCustom(): void {
    this.saveConsent({
      essential: true,
      analytics: this.analyticsConsent(),
      marketing: this.marketingConsent(),
      timestamp: new Date().toISOString(),
    });
  }

  toggleDetails(): void {
    this.showDetails.update((v) => !v);
  }

  private saveConsent(consent: CookieConsent): void {
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    }
    this.isVisible.set(false);
  }
}
