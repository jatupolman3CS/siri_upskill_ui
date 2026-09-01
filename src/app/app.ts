import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { environment } from '../environments/environment';
import { ToastHost } from './shared/toast/toast-host';
import { DevRoleSwitcher } from './shared/dev-role-switcher/dev-role-switcher';
import { RouteProgressBar } from './shared/route-progress-bar/route-progress-bar';

@Component({
  selector: 'app-root',
  // DevRoleSwitcher is referenced only inside app.html's `@defer` block, never eagerly in the
  // template — Angular's compiler automatically turns this static import into a lazy dynamic
  // import + separate chunk for exactly that reason (no manual `import()` needed). Keeping the
  // normal import + imports-array entry here is what makes that automatic code-splitting kick in.
  imports: [RouterOutlet, ToastHost, DevRoleSwitcher, RouteProgressBar],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /**
   * Gates both whether `<app-dev-role-switcher>` renders (it already self-gates on this same
   * flag) and whether its `@defer` block in app.html ever triggers a fetch at all — `false` in
   * every production build (`environment.ts`). Checking it here too, one level up, is what keeps
   * that component's ~30KB of static nav data + 32 registered icons out of the *initial* bundle
   * entirely instead of merely rendering nothing: `@defer` alone splits it into its own chunk, but
   * only this `@if` stops that chunk from ever being *fetched* when the feature is off.
   */
  protected readonly devBypassEnabled = environment.devAuth.bypass;
}
