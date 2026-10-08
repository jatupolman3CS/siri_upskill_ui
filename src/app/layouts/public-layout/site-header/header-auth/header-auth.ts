import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AccountMenu } from '../account-menu/account-menu';

/**
 * The header's account slot, with three mutually exclusive states:
 * <list>
 * <item>**unresolved** (SSR, and the browser until the refresh-cookie restore has finished) — a neutral
 * fixed-size placeholder, so a signed-in visitor never sees Sign in / Register flash up and a guest
 * never sees an avatar flash up;</item>
 * <item>**signed in** — the avatar `AccountMenu`, and never any Sign in / Register button;</item>
 * <item>**guest** — Sign in (text) and Register (filled pill).</item>
 * </list>
 */
@Component({
  selector: 'app-header-auth',
  imports: [RouterLink, TranslatePipe, AccountMenu],
  templateUrl: './header-auth.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderAuth {
  protected readonly auth = inject(AuthService);
}
