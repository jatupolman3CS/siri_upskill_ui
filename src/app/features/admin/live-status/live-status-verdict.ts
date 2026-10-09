import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorCheckCircle, phosphorWarning } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { LiveAdminStatus } from '../../live/data/live-admin.models';
import { adminVerdict, warningView } from '../../live/data/live-admin.util';

/**
 * The top-of-page answer to "can we run live classes right now?". "Ready" only when the server reported NO warnings;
 * otherwise a prominent list where every warning says what is wrong, what it breaks, and what to do about it.
 */
@Component({
  selector: 'app-live-status-verdict',
  imports: [NgIcon, TranslatePipe],
  templateUrl: './live-status-verdict.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorCheckCircle, phosphorWarning })],
  host: { class: 'block' },
})
export class LiveStatusVerdict {
  readonly status = input.required<LiveAdminStatus>();

  protected readonly isReady = computed(() => adminVerdict(this.status()) === 'ready');
  /** One card per distinct code (a repeated code would otherwise duplicate the `@for` track key). */
  protected readonly warnings = computed(() => Array.from(new Set(this.status().warnings), (code) => warningView(code)));
}
