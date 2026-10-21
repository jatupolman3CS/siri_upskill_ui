import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorLinkSimple } from '@ng-icons/phosphor-icons/regular';

import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { isHttpsUrl } from '../../../../live/data/live-instructor.util';
import type { EvidenceLink } from '../../../data/tutoring-dispute.models';

/**
 * The evidence links on a dispute or a message. A link is somebody else's address, so each one shows its host before it is
 * followed, opens in a new tab with `noopener noreferrer nofollow` and says it leaves the platform. Only an https address is
 * ever bound to an `href`; anything else is shown as plain text. The label (typed by the other person) is rendered as text.
 */
@Component({
  selector: 'app-evidence-link-list',
  imports: [NgIcon, TranslatePipe],
  template: `
    @if (links().length > 0) {
      <ul class="flex flex-col gap-1.5" [attr.aria-label]="'tutoring.dispute.evidence.listLabel' | translate">
        @for (link of links(); track link.evidenceId) {
          <li class="flex items-start gap-2 text-sm text-[var(--color-text)]">
            <ng-icon name="phosphorLinkSimple" aria-hidden="true" class="mt-0.5 shrink-0 text-base" />
            <span class="min-w-0 break-words">
              @if (safe(link)) {
                <a [href]="link.url" target="_blank" rel="noopener noreferrer nofollow" class="font-semibold text-[var(--color-primary-text)] underline">
                  {{ link.label || link.host }}
                  <span class="sr-only">({{ 'tutoring.dispute.evidence.external' | translate }})</span>
                </a>
              } @else {
                <span class="font-semibold">{{ link.label || link.host }}</span>
              }
              <span class="text-[var(--color-text-muted)]"> · {{ link.host }}</span>
            </span>
          </li>
        }
      </ul>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorLinkSimple })],
  host: { class: 'block' },
})
export class EvidenceLinkList {
  readonly links = input.required<readonly EvidenceLink[]>();

  protected safe(link: EvidenceLink): boolean {
    return isHttpsUrl(link.url);
  }
}
