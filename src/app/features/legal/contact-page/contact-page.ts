import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorBriefcase, phosphorEnvelopeSimple, phosphorShieldCheck } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { buildBreadcrumbListJsonLd } from '../../../core/seo/schema-org.util';
import { SeoService } from '../../../core/seo/seo.service';
import { Spinner } from '../../../shared/spinner/spinner';
import { ToastService } from '../../../shared/toast/toast.service';
import { ContactApiService } from '../data/contact-api.service';
import { LEGAL_CONTACT_EMAILS } from '../legal-contact';

@Component({
  selector: 'app-contact-page',
  imports: [FormsModule, TranslatePipe, Spinner, NgIcon],
  templateUrl: './contact-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorEnvelopeSimple, phosphorShieldCheck, phosphorBriefcase })],
})
export class ContactPage {
  private readonly toast = inject(ToastService);
  private readonly contactApi = inject(ContactApiService);
  private readonly translation = inject(TranslationService);
  private readonly seoService = inject(SeoService);

  protected readonly emails = LEGAL_CONTACT_EMAILS;

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  name = '';
  email = '';
  subject = '';
  message = '';
  botField = ''; // Honeypot trap

  constructor() {
    this.seoService.set({
      title: `${this.translation.t('contact.pageTitle')} | ${this.translation.t('common.appName')}`,
      description: this.translation.t('contact.pageDescription'),
      path: '/contact',
      openGraph: { type: 'website' },
      jsonLd: [
        buildBreadcrumbListJsonLd([
          { name: this.translation.t('nav.home') || 'Home', url: this.seoService.absoluteUrl('/') },
          { name: this.translation.t('contact.pageTitle') || 'Contact Us', url: this.seoService.absoluteUrl('/contact') },
        ]),
      ],
    });
  }

  sendMessage(): void {
    if (!this.name.trim() || !this.email.trim() || !this.message.trim()) {
      this.toast.error(this.translation.t('contact.validationRequired'));
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    this.contactApi
      .submitContactMessage({
        name: this.name.trim(),
        email: this.email.trim(),
        subject: this.subject.trim() || 'General Inquiry',
        message: this.message.trim(),
        botField: this.botField || null,
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.submitted.set(true);
          this.toast.success(this.translation.t('contact.successToast'));
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const msg = err?.error?.detail || err?.error?.message || this.translation.t('contact.sendFailed');
          this.errorMessage.set(msg);
          this.toast.error(msg);
        },
      });
  }
}
