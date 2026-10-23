/**
 * One origin: the browser only ever calls same-origin `/api/v1/...`, and this rewrite forwards it to the API. That means no CORS,
 * and the API's SameSite=Strict refresh cookie is first-party. `API_ORIGIN` is read on the server only (never put it in a
 * NEXT_PUBLIC_ variable). In production a reverse proxy does the same job: route `/api/` to the API and everything else to Next.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Browser tests build into their own folder so they never disturb a running development server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
