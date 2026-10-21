import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorDownloadSimple, phosphorFileText, phosphorLinkSimple, phosphorNotePencil } from '@ng-icons/phosphor-icons/regular';

import { BangkokDatePipe } from '../../../../../core/i18n/bangkok-date.pipe';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { Button } from '../../../../../shared/button/button';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import { isHttpsUrl } from '../../../../live/data/live-instructor.util';
import { DownloadNavigator } from '../../../data/download-navigator';
import type { Guid, MaterialDto } from '../../../data/tutoring-classes.models';
import { tutoringErrorKey } from '../../../data/tutoring-errors';
import { TutoringSessionApiService } from '../../../data/tutoring-session-api.service';
import { materialKindLabelKey } from '../../../data/tutoring-tutor-labels';
import { TutorProblem } from '../../../ui/tutor-problem/tutor-problem';

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * The teaching materials of a class, as the learner sees them (P13-10 section 8): links, homework and files the tutor added,
 * shared by everyone booked on the class. Read only. An external link opens in a new tab with `noopener noreferrer nofollow`
 * and says it leaves the platform; only an https address is ever bound to an `href` (anything else is shown as plain text). A
 * file is never linked by a storage address: the button asks the server for a short-lived signed address, goes there at once and
 * keeps nothing. The texts are plain text from the tutor and are rendered as text.
 */
@Component({
  selector: 'app-booking-materials-section',
  imports: [NgIcon, TranslatePipe, BangkokDatePipe, Button, Skeleton, TutorProblem],
  templateUrl: './booking-materials-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorDownloadSimple, phosphorFileText, phosphorLinkSimple, phosphorNotePencil })],
  host: { class: 'block' },
})
export class BookingMaterialsSection {
  private readonly api = inject(TutoringSessionApiService);
  private readonly downloads = inject(DownloadNavigator);
  private readonly i18n = inject(TranslationService);

  readonly sessionId = input.required<Guid>();

  private readonly materialsResource = rxResource({
    params: () => this.sessionId(),
    stream: ({ params }) => this.api.listMaterials(params),
  });
  protected readonly items = computed<readonly MaterialDto[]>(() => (this.materialsResource.hasValue() ? this.materialsResource.value() : []));
  protected readonly isLoading = computed(() => this.materialsResource.isLoading() && !this.materialsResource.hasValue());
  protected readonly hasError = computed(() => this.materialsResource.status() === 'error');

  protected readonly kindKey = materialKindLabelKey;
  protected readonly busyId = signal<Guid | null>(null);
  protected readonly problem = signal<string | null>(null);

  protected safeUrl(item: MaterialDto): string | null {
    return item.url !== null && isHttpsUrl(item.url) ? item.url : null;
  }

  protected iconOf(item: MaterialDto): string {
    return item.kind === 'File' ? 'phosphorFileText' : item.kind === 'Link' ? 'phosphorLinkSimple' : 'phosphorNotePencil';
  }

  protected sizeText(bytes: number | null): string {
    return bytes === null ? '' : this.i18n.t('tutoring.learner.my.materials.fileSize', { size: Math.max(0.1, Math.round((bytes / BYTES_PER_MEGABYTE) * 10) / 10) });
  }

  protected reload(): void {
    this.materialsResource.reload();
  }

  /** Asks for a short-lived signed address and goes there at once; the file arrives as an attachment, so the page stays put. */
  protected download(item: MaterialDto): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(item.id);
    this.problem.set(null);
    this.api.getMaterialDownload(this.sessionId(), item.id).subscribe({
      next: (download) => {
        this.busyId.set(null);
        if (isHttpsUrl(download.downloadUrl)) {
          this.downloads.go(download.downloadUrl);
        }
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.problem.set(this.i18n.t(tutoringErrorKey(error)));
      },
    });
  }
}
