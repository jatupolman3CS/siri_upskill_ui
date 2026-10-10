/**
 * Hands a signed storage URL to the browser as a file download and reports whether it did. The URL points at a private
 * bucket and answers with `Content-Disposition: attachment`, so a plain anchor click downloads it in place. Do NOT use
 * `window.open` here: this runs after an async call (fetching the short-lived URL), where popup blockers refuse the new
 * window.
 *
 * Only absolute `http(s)` URLs are followed (the API sends https); anything else — a `javascript:` URL, a relative
 * path, garbage — returns `false` and is never clicked.
 *
 * Browser-only: call it from a click handler, never from a constructor or during SSR.
 */
export function startFileDownload(doc: Document, url: string, fileName: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }
  const anchor = doc.createElement('a');
  anchor.href = parsed.href;
  anchor.download = fileName;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}
