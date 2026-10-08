import { Injectable, signal } from '@angular/core';

import { type Guid, problemOf } from './live.models';

/**
 * Carries one fact between two screens that must not know about each other: the course builder's "submit for review" was
 * refused with `live.meetings_not_ready` (appendix §0), naming the sessions that still have no meeting room. The builder page
 * `capture()`s the failure; the live-schedule panel reads `notReadySessionIds` to mark those sessions. The marks clear as soon
 * as the panel sees fresh room data or a new submit succeeds.
 */
@Injectable({ providedIn: 'root' })
export class LiveSubmitIssues {
  private readonly ids = signal<readonly Guid[]>([]);

  readonly notReadySessionIds = this.ids.asReadonly();

  /** Returns `true` when `error` is the "rooms not ready" refusal (and remembers which sessions), `false` otherwise. */
  capture(error: unknown): boolean {
    const problem = problemOf(error);
    if (problem?.reason !== 'live.meetings_not_ready') {
      return false;
    }
    this.ids.set([...(problem.sessionIds ?? [])]);
    return true;
  }

  clear(): void {
    if (this.ids().length > 0) {
      this.ids.set([]);
    }
  }
}
