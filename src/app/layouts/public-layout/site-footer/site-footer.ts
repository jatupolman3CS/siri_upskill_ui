import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/**
 * Site footer for `PublicLayout` — brand, tagline, link columns and a copyright line. `RouterLink`
 * must stay in `imports`: without it the `routerLink` attributes in the template are inert text and
 * every footer link silently does nothing.
 */
@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './site-footer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooter {
  /** Plain system-clock read, not a browser API — safe during SSR (frontend.md's SSR guard rule is
   *  about `window`/`document`/`localStorage`/`navigator`, none of which this touches). */
  protected readonly year = new Date().getFullYear();

  protected readonly authService = inject(AuthService);
}
