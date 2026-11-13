// Put this file at: src/app/core/link.util.ts
export function cleanLink(raw: string): { ok: boolean; url: string; error?: string } {
  const url = (raw || '').trim();
  if (!url) return { ok: true, url: '' }; // links are optional
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') {
      return { ok: false, url, error: 'The link must start with https://' };
    }
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, url, error: 'That doesn’t look like a valid link.' };
  }
}