import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorLockKey, phosphorX } from '@ng-icons/phosphor-icons/regular';

import { ApiError } from '../../../../../core/http/error.interceptor';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { Button } from '../../../../../shared/button/button';
import { Skeleton } from '../../../../../shared/skeleton/skeleton';
import type { Guid } from '../../../data/tutoring-public.models';
import { tutoringAdminErrorKey } from '../../data/admin-errors';
import { AdminKycApiService } from '../../data/admin-kyc-api.service';
import { type PreviewKind, previewKindOf } from '../kyc-case.util';

/**
 * Open parameters for the browser's built-in PDF viewer: no toolbar (so no download / print buttons) and no thumbnail pane. A reduction
 * of what is on offer, not a control - the administrator can already see the document and a browser's context menu still saves it.
 * They go after the object URL as a fragment, which never reaches the network and is not part of what `revokeObjectURL` is given.
 */
const PDF_VIEWER_PARAMS = '#toolbar=0&navpanes=0';

/**
 * In-page viewer for ONE identity document (P13-26). The API streams the decrypted bytes (P13-02 section 5.3); this component
 * fetches them through the normal client (so the bearer token travels in a header, never in a URL), shows them from an object URL
 * and revokes it the moment the viewer closes or is destroyed.
 *
 * Privacy contract, in order of importance:
 *  - nothing is ever persisted: no `localStorage` / IndexedDB / Cache API / service worker, no download button, no copy of the file
 *    name (the API sends none), and nothing about the file is logged or put in a URL;
 *  - the page states, before and while a file is shown, that this access is recorded; each open (and each retry) is a recorded view;
 *  - the kind of preview comes from the content type the SERVER decided on, and anything but JPEG / PNG / PDF is not rendered.
 *
 * The one `bypassSecurityTrustResourceUrl` below is for the `blob:` URL this component created itself a few lines earlier from bytes
 * the authenticated API returned - it is never a URL from the network, a route or user input - and Angular insists on a trusted
 * resource URL for an `<iframe>`. A plain `<img>` is used because `NgOptimizedImage` cannot take a `blob:` source.
 */
@Component({
  selector: 'app-kyc-document-viewer',
  imports: [TranslatePipe, Button, Skeleton, NgIcon],
  templateUrl: './kyc-document-viewer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorLockKey, phosphorX })],
})
export class KycDocumentViewer {
  private readonly api = inject(AdminKycApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly documentId = input.required<Guid>();
  /** i18n key of the document type, for the heading. */
  readonly typeLabelKey = input.required<string>();
  readonly closed = output<void>();

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  private readonly contentResource = rxResource({
    params: () => this.documentId(),
    stream: ({ params }) => this.api.getDocumentContent(params),
  });

  protected readonly objectUrl = signal<string | null>(null);
  /** Still fetching, or fetched but the object URL is not made yet (it is created by an effect one tick after the bytes arrive). */
  protected readonly isLoading = computed(() => this.contentResource.isLoading() || (this.contentResource.hasValue() && this.objectUrl() === null));
  protected readonly kind = computed<PreviewKind>(() => (this.contentResource.hasValue() ? previewKindOf(this.contentResource.value().type) : 'other'));
  protected readonly safePdfUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.objectUrl();
    return url !== null && this.kind() === 'pdf' ? this.sanitizer.bypassSecurityTrustResourceUrl(`${url}${PDF_VIEWER_PARAMS}`) : null;
  });

  protected readonly errorKey = computed(() => (this.contentResource.status() === 'error' ? tutoringAdminErrorKey(this.contentResource.error()) : null));
  /** A refusal that retrying cannot change (not found, already deleted, not an administrator) hides the retry button. */
  protected readonly canRetry = computed(() => {
    const error = this.contentResource.error();
    return !(error instanceof ApiError) || ![403, 404, 410].includes(error.status);
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.isBrowser || !this.contentResource.hasValue()) {
        return;
      }
      const url = URL.createObjectURL(this.contentResource.value());
      this.objectUrl.set(url);
      onCleanup(() => {
        URL.revokeObjectURL(url);
        this.objectUrl.set(null);
      });
    });

    afterNextRender(() => this.heading()?.nativeElement.focus());
  }

  protected retry(): void {
    this.contentResource.reload();
  }
}
