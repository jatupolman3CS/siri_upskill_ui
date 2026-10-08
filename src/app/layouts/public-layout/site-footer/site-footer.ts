import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { BrandLogo } from '../brand-logo/brand-logo';

interface FooterLink {
  readonly id: string;
  readonly labelKey: string;
  readonly path: string;
}

/**
 * Minimal site footer for `PublicLayout`: brand + tagline, one row of everyday links, the legal links
 * and the copyright line. Account/studio/admin/PDPA entries deliberately do NOT live here — they are in
 * the header's signed-in account menu. `RouterLink` must stay in `imports`: without it the `routerLink`
 * attributes in the template are inert text and every footer link silently does nothing.
 */
@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, TranslatePipe, BrandLogo],
  templateUrl: './site-footer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooter {
  /** Plain system-clock read, not a browser API — safe during SSR (frontend.md's SSR guard rule is
   *  about `window`/`document`/`localStorage`/`navigator`, none of which this touches). */
  protected readonly year = new Date().getFullYear();

  protected readonly links: readonly FooterLink[] = [
    { id: 'courses', labelKey: 'footer.courses', path: '/courses' },
    { id: 'blog', labelKey: 'footer.blog', path: '/blog' },
    { id: 'faq', labelKey: 'footer.faq', path: '/faq' },
    { id: 'contact', labelKey: 'footer.contact', path: '/contact' },
    { id: 'verify-certificate', labelKey: 'footer.verifyCertificate', path: '/certificates/verify' },
  ];

  protected readonly legalLinks: readonly FooterLink[] = [
    { id: 'terms', labelKey: 'footer.terms', path: '/terms' },
    { id: 'privacy', labelKey: 'footer.privacy', path: '/privacy' },
    { id: 'refund-policy', labelKey: 'footer.refundPolicy', path: '/refund-policy' },
  ];
}
