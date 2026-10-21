/**
 * Runs `callback` every `periodMs` while the tab is visible and returns a stop function. A hidden tab neither polls nor
 * queues up missed ticks - it simply resumes on the next period once visible again - so a forgotten background tab does
 * not keep hitting the (rate-limited) public API. Takes the `Document` explicitly so it is SSR-agnostic and testable.
 */
export function startVisibleInterval(doc: Document, periodMs: number, callback: () => void): () => void {
  const timer = setInterval(() => {
    if (doc.visibilityState === 'visible') {
      callback();
    }
  }, periodMs);
  return () => clearInterval(timer);
}
