import { PLATFORM_ID, computed, effect, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Runs `tick` every `intervalMs` while `shouldPoll()` is true, and not at all otherwise. Stops when the condition turns
 * false and when the owning component/service is destroyed (the effect's cleanup). Browser-only: never schedules a timer
 * during SSR. Call from an injection context.
 *
 * The condition is wrapped in `computed`, so the timer is only recreated when the boolean actually flips — not every time
 * the data it reads is refreshed by the poll itself.
 */
export function pollWhile(shouldPoll: () => boolean, tick: () => void, intervalMs: number): void {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const active = computed(shouldPoll);

  effect((onCleanup) => {
    if (!isBrowser || !active()) {
      return;
    }
    const handle = setInterval(tick, intervalMs);
    onCleanup(() => clearInterval(handle));
  });
}
