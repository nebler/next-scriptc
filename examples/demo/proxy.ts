// Only rejected paths invoke this proxy. Keep the literal matcher in sync with
// the public route inventory test; unknown/future API routes are denied too.
export function proxy() {
  if (process.env.NEXT_SCRIPTC_PUBLIC_DEMO === "1") {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export const config = {
  matcher: [
    "/api/((?!hello/?$|analytics/revenue/?$|stores/nearby/?$|heavy/vectors/?$).*)",
    // Proxy precedes next.config rewrites: reject aliases before they can route
    // around the API matcher (including future rewrite destinations).
    "/rewrite/:path*",
  ],
};
