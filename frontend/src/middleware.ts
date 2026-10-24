import { NextResponse, type NextRequest } from "next/server";

import { buildCsp, makeNonce } from "@/lib/csp";

/**
 * Adds the Content-Security-Policy, with a new nonce for every request. The policy is also put on the REQUEST headers: that is
 * how Next learns the nonce and stamps it on its own inline scripts; the root layout reads `x-nonce` for the theme-init script.
 * Everything else (the other security headers) is static and lives in next.config.mjs. API calls are proxied to the API,
 * which sends its own headers, so they are skipped here.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = makeNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [{ source: "/((?!api/|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
