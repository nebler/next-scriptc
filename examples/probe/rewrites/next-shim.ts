// Deliberately small probe shim: only the members used by next-server/route.ts.
// This is a wrapper, not a subclass of native Request/Response.
class RequestCookies {
  private values = new Map<string, string>();

  constructor(headers: Headers) {
    for (const part of (headers.get("cookie") ?? "").split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      const name = part.slice(0, separator).trim();
      try {
        this.values.set(name, decodeURIComponent(part.slice(separator + 1).trim()));
      } catch {
        // Match Next's omission of malformed cookie encodings.
      }
    }
  }

  get(name: string): { name: string; value: string } | undefined {
    const value = this.values.get(name);
    return value === undefined ? undefined : { name, value };
  }
}

export class NextRequest {
  readonly nextUrl: URL;
  readonly cookies: RequestCookies;

  constructor(url: string, init?: RequestInit) {
    const request = new Request(url, init);
    this.nextUrl = new URL(request.url);
    this.cookies = new RequestCookies(request.headers);
  }
}

export class NextResponse {
  static json(body: unknown, init?: ResponseInit): Response {
    return Response.json(body, init);
  }
}
