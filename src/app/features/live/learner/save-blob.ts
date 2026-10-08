/**
 * Hands a fetched file to the browser as a download. Used for the `.ics` calendar file, which has to be fetched through
 * `HttpClient` (a plain link would not carry the bearer token) and is then saved from an object URL.
 *
 * Browser-only by nature: call it from a click handler, never from a constructor or during SSR.
 */
export function saveBlob(doc: Document, blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has already been handed off.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
