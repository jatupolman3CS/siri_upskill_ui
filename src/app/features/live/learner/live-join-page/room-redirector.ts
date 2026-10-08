import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Sends the browser to the live room. `location.replace` (not `assign`) is deliberate: the join page is a transient
 * hand-off, so it must not stay in the history where "Back" would re-run it and request the room link again.
 *
 * Isolated in its own tiny service so the join page can be tested without actually navigating the test window, and so
 * the room URL passes through here as a call argument only — it is never stored, logged or exposed.
 */
@Injectable({ providedIn: 'root' })
export class RoomRedirector {
  private readonly document = inject(DOCUMENT);

  go(url: string): void {
    this.document.defaultView?.location.replace(url);
  }
}
