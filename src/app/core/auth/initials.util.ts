/** Thai leading vowels (U+0E40..U+0E44: เ แ โ ใ ไ) are written *before* the consonant they follow in
 *  speech, so they make a meaningless initial on their own — skip them to land on the real first
 *  consonant. */
const THAI_LEADING_VOWELS = /^[เ-ไ]+/u;

/** Punctuation/symbols around a word ("(Seed)", "-Anna") say nothing about who the person is. */
const LEADING_NON_LETTERS = /^[^\p{L}\p{N}]+/u;

/** First visible letter of a name part, upper-cased (Latin only; Thai has no case); `''` if it has none. */
function firstLetter(part: string): string {
  const stripped = part.replace(LEADING_NON_LETTERS, '').replace(THAI_LEADING_VOWELS, '');
  const first = Array.from(stripped)[0] ?? '';
  return first.toLocaleUpperCase();
}

/**
 * Initials for an avatar fallback: up to two characters — first letter of the first and last word for
 * space-separated names ("Somchai Jaidee" → "SJ"), just the first letter for a single word or for Thai
 * names, which are written without spaces between given name and surname. Words without any letter or
 * digit are ignored. Returns `''` when there is nothing usable (callers then fall back to an icon).
 */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((part) => firstLetter(part) !== '');
  const first = parts[0];
  if (first === undefined) {
    return '';
  }
  const last = parts[parts.length - 1] ?? first;
  if (parts.length === 1) {
    return firstLetter(first);
  }
  return firstLetter(first) + firstLetter(last);
}
