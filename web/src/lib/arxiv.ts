/**
 * Mirror of ArxivClient.TryNormalizeId (LIBRAIN/Ingestion/ArxivClient.cs), so
 * the form rejects exactly what the API would. Accepts a new-style id
 * ("2005.11401"), a version suffix ("2005.11401v2"), an "arXiv:" prefix, or an
 * absolute arxiv.org abs/pdf URL. Returns the id without its version, or null.
 */
export function normalizeArxivId(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  let s = input.trim();
  if (s.toLowerCase().startsWith('arxiv:')) s = s.slice(6).trim();

  const url = absoluteUrl(s);
  if (url && url.hostname.toLowerCase().endsWith('arxiv.org')) {
    const last = url.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    s = last.toLowerCase().endsWith('.pdf') ? last.slice(0, -4) : last;
  }

  const m = /^(\d{4}\.\d{4,5})(v\d+)?$/.exec(s);
  return m ? (m[1] ?? null) : null;
}

/** Like .NET's Uri.TryCreate(s, UriKind.Absolute): needs a scheme. */
function absoluteUrl(s: string): URL | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return null;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}
