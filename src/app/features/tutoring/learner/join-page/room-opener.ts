import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Tries to open the classroom in a NEW tab, so the join page stays where it is (it still has the "is the tutor here?" question and
 * the room button to show). A browser may block a window that was not opened by a click, which is why the page always shows the
 * button too. The room URL passes through here as a call argument only - it is never stored, logged or exposed. `noopener` keeps
 * the classroom from reaching back into this page.
 *
 * Its own tiny service so the page can be tested without opening a real window.
 */
@Injectable({ providedIn: 'root' })
export class RoomOpener {
  private readonly document = inject(DOCUMENT);

  open(url: string): void {
    this.document.defaultView?.open(url, '_blank', 'noopener,noreferrer');
  }
}
