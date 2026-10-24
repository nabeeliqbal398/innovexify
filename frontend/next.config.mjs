/**
 * One origin: the browser only ever calls same-origin `/api/v1/...`, and this rewrite forwards it to the API. That means no CORS,
 * and the API's SameSite=Strict refresh cookie is first-party. `API_ORIGIN` is read on the server only (never put it in a
 * NEXT_PUBLIC_ variable). In production a reverse proxy does the same job: route `/api/` to the API and everything else to Next.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Headers that are the same for every response. The Content-Security-Policy is NOT here: it carries a per-request nonce for the
 * inline scripts (Next's own and the theme-init script), so src/middleware.ts builds it (src/lib/csp.ts).
 * API responses come back through the /api rewrite with the API's own Helmet headers, which these do not override.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No Referer at all: reset and invitation links carry a secret in the path and must never reach another site.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  // Older browsers that do not know CSP frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only meaningful over HTTPS, which is how production is served; a browser ignores it on plain http.
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Browser tests build into their own folder so they never disturb a running development server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // A link with a secret in its path is not to be kept by the browser or any cache.
      { source: "/reset-password/:token", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/invite/:token", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
