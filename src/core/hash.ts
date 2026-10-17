/** Normalizes a free-text answer: case, ё→е, punctuation and repeated whitespace do not matter. */
export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const hashAnswer = (raw: string): Promise<string> => sha256Hex(normalizeAnswer(raw));

export async function matchesAnyHash(raw: string, hashes: readonly string[] | undefined): Promise<boolean> {
  if (!hashes?.length || !normalizeAnswer(raw)) return false;
  const hash = await hashAnswer(raw);
  return hashes.some((h) => h.toLowerCase() === hash);
}
