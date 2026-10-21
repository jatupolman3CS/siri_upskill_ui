import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Sends the browser to a file's short-lived signed address. The file arrives as an attachment, so the page stays where it is. The
 * address passes through here as a call argument only - it is never stored, logged or shown. Its own tiny service so a screen
 * can be tested without navigating the test window.
 */
@Injectable({ providedIn: 'root' })
export class DownloadNavigator {
  private readonly document = inject(DOCUMENT);

  go(url: string): void {
    this.document.defaultView?.location.assign(url);
  }
}
