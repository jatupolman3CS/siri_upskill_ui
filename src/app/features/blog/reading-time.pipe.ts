import { Pipe, PipeTransform } from '@angular/core';

/** Typical adult silent-reading speed for web articles. */
const WORDS_PER_MINUTE = 200;
/** Thai has no spaces between words, so characters are converted to "words" with a rough average. */
const THAI_CHARS_PER_WORD = 6;
const THAI_BASE_CHARACTER = /[ก-ะาำเ-ๆ]/g;
const LATIN_WORD = /[A-Za-z0-9]+/g;

/**
 * Estimated reading time in whole minutes for an article body, or `null` when there is no readable text
 * (so callers can omit the label instead of showing an invented number). A heuristic for display only —
 * the markup is stripped with a regex, which is fine for counting but never for rendering or sanitizing.
 */
export function estimateReadingMinutes(html: string | null | undefined): number | null {
  if (!html) return null;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const latinWords = text.match(LATIN_WORD)?.length ?? 0;
  const thaiCharacters = text.match(THAI_BASE_CHARACTER)?.length ?? 0;
  const words = latinWords + thaiCharacters / THAI_CHARS_PER_WORD;
  return words < 1 ? null : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

@Pipe({ name: 'readingMinutes' })
export class ReadingMinutesPipe implements PipeTransform {
  transform(html: string | null | undefined): number | null {
    return estimateReadingMinutes(html);
  }
}
