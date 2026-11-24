/**
 * Normalize and extract domain from URL for duplicate prevention and indexing.
 */
export function extractDomain(url?: string | null): string {
  if (!url) return '';
  try {
    let clean = url.trim().toLowerCase();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    return parsed.hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}
