/**
 * The Content-Security-Policy for every page. Scripts: only our own files and the inline scripts that carry this request's nonce
 * (Next's own bootstrap scripts and the theme-init script). No other inline script, no eval, no other origin.
 *
 * Styles allow inline: React writes style="" attributes into the HTML it renders. That is a smaller risk than script injection
 * and removing it would need every style attribute to move to a class; it is listed in GO-LIVE.md as a known trade-off.
 */
export function buildCsp(nonce: string, development = false): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, ...(development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // data: for the company logo (sent as a data URL), blob: for document previews opened from an authenticated download.
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(development ? ["ws:", "wss:"] : [])],
    // A PDF preview is a blob: document in an iframe, and a blob document inherits this policy, so its viewer needs object-src.
    "frame-src": ["'self'", "blob:"],
    "object-src": ["'self'", "blob:"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** A fresh, unguessable value for each request. */
export function makeNonce(): string {
  return btoa(crypto.randomUUID());
}
