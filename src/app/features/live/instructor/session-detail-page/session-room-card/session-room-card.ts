import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorArrowSquareOut, phosphorCopy, phosphorVideoCamera } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { ToastService } from '../../../../../shared/toast/toast.service';
import type { InstructorMeetingSummary, InstructorSessionDetail } from '../../../data/live-instructor.models';
import { isHttpsUrl, meetingStatusView } from '../../../data/live-instructor.util';
import { StatusChip } from '../../ui/status-chip/status-chip';
import { MeetingActions } from '../../ui/meeting-actions/meeting-actions';

/**
 * The room section of the instructor's session page. The owner — and only the owner — may see the room link, copy it and
 * open the room (appendix §B.5); nothing here ever leaves the page (no storage, no router state, no logging).
 */
@Component({
  selector: 'app-live-session-room-card',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, Button, StatusChip, MeetingActions],
  templateUrl: './session-room-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorArrowSquareOut, phosphorCopy, phosphorVideoCamera })],
  host: { class: 'block' },
})
export class SessionRoomCard {
  private readonly document = inject(DOCUMENT);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly detail = input.required<InstructorSessionDetail>();
  readonly googleConfigured = input<boolean | null>(null);
  readonly meetingChange = output<InstructorMeetingSummary>();

  protected readonly view = computed(() => meetingStatusView(this.detail().meeting));
  /** Only an https link is ever bound to an `href` — a stored value that is not https is simply not offered. */
  protected readonly roomUrl = computed(() => {
    const url = this.detail().meetUrl;
    return url && isHttpsUrl(url) ? url : null;
  });
  protected readonly providerKey = computed(() => {
    const provider = this.detail().meeting.provider;
    return provider ? `live.instructor.provider.${provider}` : null;
  });
  /** Room management only makes sense until the session is over. */
  protected readonly canManage = computed(() => ['Upcoming', 'Live'].includes(this.detail().displayState));
  protected readonly returnPath = computed(() => `/instructor/sessions/${this.detail().sessionId}`);

  protected async copyLink(): Promise<void> {
    const url = this.roomUrl();
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!url || !clipboard) {
      this.toast.error(this.i18n.t('live.instructor.room.copyFailed'));
      return;
    }
    try {
      await clipboard.writeText(url);
      this.toast.success(this.i18n.t('live.instructor.room.copied'));
    } catch {
      this.toast.error(this.i18n.t('live.instructor.room.copyFailed'));
    }
  }
}
