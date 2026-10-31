// The route-handler subset of next/server. Middleware and NextURL routing metadata
// deliberately have no declarations here, so native builds reject their use.
export type RequestCookie = { name: string; value: string };
export type CookieOptions = {
  path?: string; expires?: Date | number; maxAge?: number; domain?: string;
  secure?: boolean; httpOnly?: boolean; sameSite?: "strict" | "lax" | "none" | boolean;
  partitioned?: boolean; priority?: "low" | "medium" | "high";
};
type ResponseCookie = RequestCookie & CookieOptions;

class RequestCookies {
  private values = new Map<string, RequestCookie>();
  constructor(header: string) {
    for (const pair of header.split(/; */)) {
      if (!pair) continue;
      const index = pair.indexOf("=");
      const name = index < 0 ? pair : pair.slice(0, index);
      try {
        this.values.set(name, { name, value: index < 0 ? "true" : decodeURIComponent(pair.slice(index + 1)) });
      } catch { /* Next ignores malformed percent encoding. */ }
    }
  }
  get(key: string | { name: string }): RequestCookie | undefined {
    return this.values.get(typeof key === "string" ? key : key.name);
  }
  getAll(key?: string | { name: string }): RequestCookie[] {
    const name = typeof key === "string" ? key : key === undefined ? undefined : key.name;
    return Array.from(this.values.values()).filter((cookie) => name === undefined || cookie.name === name);
  }
  has(name: string): boolean { return this.values.has(name); }
}

function serialize(cookie: ResponseCookie): string {
  const attrs: string[] = [];
  if (cookie.path) attrs.push(`Path=${cookie.path}`);
  const expires = cookie.expires;
  if (typeof expires === "number") attrs.push(`Expires=${new Date(expires).toUTCString()}`);
  else if (expires) attrs.push(`Expires=${expires.toUTCString()}`);
  if (typeof cookie.maxAge === "number") attrs.push(`Max-Age=${cookie.maxAge}`);
  if (cookie.domain) attrs.push(`Domain=${cookie.domain}`);
  if (cookie.secure) attrs.push("Secure");
  if (cookie.httpOnly) attrs.push("HttpOnly");
  if (cookie.sameSite) attrs.push(`SameSite=${cookie.sameSite}`);
  if (cookie.partitioned) attrs.push("Partitioned");
  if (cookie.priority) attrs.push(`Priority=${cookie.priority}`);
  const value = `${cookie.name}=${encodeURIComponent(cookie.value)}`;
  return attrs.length ? `${value}; ${attrs.join("; ")}` : value;
}

class ResponseCookies {
  private values = new Map<string, ResponseCookie>();
  private headers: Headers;
  constructor(headers: Headers) {
    this.headers = headers;
    // Preserve cookies supplied in init before the first set/delete, as Next does.
    for (const header of headers.getSetCookie()) {
      const parts = header.split(/; */);
      const pair = parts.shift() || "";
      const index = pair.indexOf("=");
      if (index < 0) continue;
      // Next's parseCookie decodes once and parseSetCookie decodes again.
      const cookie: ResponseCookie = { name: pair.slice(0, index), value: decodeURIComponent(decodeURIComponent(pair.slice(index + 1))) };
      for (const part of parts) {
        const index = part.indexOf("=");
        const attribute = index < 0 ? part : part.slice(0, index);
        const name = attribute.toLowerCase().replaceAll("-", "");
        const value = index < 0 ? "true" : decodeURIComponent(part.slice(index + 1));
        if (name === "path" && value) cookie.path = value;
        else if (name === "domain" && value) cookie.domain = value;
        else if (name === "expires" && value) cookie.expires = new Date(value);
        else if (name === "maxage" && Number(value)) cookie.maxAge = Number(value);
        else if (name === "secure" && value) cookie.secure = true;
        else if (name === "httponly" && value) cookie.httpOnly = true;
        else if (name === "partitioned" && value) cookie.partitioned = true;
        else if (name === "samesite") {
          const lower = value.toLowerCase();
          if (lower === "strict" || lower === "lax" || lower === "none") cookie.sameSite = lower;
        } else if (name === "priority") {
          const lower = value.toLowerCase();
          if (lower === "low" || lower === "medium" || lower === "high") cookie.priority = lower;
        }
      }
      this.values.set(cookie.name, cookie);
    }
  }
  set(cookie: ResponseCookie): this;
  set(name: string, value: string, options?: CookieOptions): this;
  set(name: string | ResponseCookie, value?: string, options?: CookieOptions): this {
    const cookie: ResponseCookie = typeof name === "string" ? { name, value: value ?? "", ...options } : { ...name };
    if (typeof cookie.expires === "number") cookie.expires = new Date(cookie.expires);
    if (cookie.maxAge) cookie.expires = new Date(Date.now() + cookie.maxAge * 1000);
    if (cookie.path === undefined) cookie.path = "/";
    this.values.set(cookie.name, cookie);
    this.headers.delete("set-cookie");
    const serialized: string[] = [];
    for (const entry of this.values.values()) {
      const header = serialize(entry);
      serialized.push(header);
      this.headers.append("set-cookie", header);
    }
    this.headers.set("x-middleware-set-cookie", serialized.join(","));
    return this;
  }
  delete(key: string | (CookieOptions & { name: string })): this {
    return this.set({ ...(typeof key === "string" ? { name: key } : key), value: "", expires: new Date(0) });
  }
}

// Composition is required: scriptc 0.4.6 cannot subclass Web Request/Response.
export class NextRequest {
  // Required for structural compatibility with Node's Request declarations.
  // These Web body parsers have no scriptc lowering; calling them is a type error.
  declare readonly blob: never;
  declare readonly formData: never;
  private parsedUrl: URL | null = null;
  private parsedCookies: RequestCookies | null = null;
  private request: Request | null = null;
  private incoming: { url: string; init: RequestInit } | null = null;
  private parsedHeaders: Headers | null = null;
  private requestUrl: string | null = null;
  private cookieHeader: string;
  constructor(input: string | URL | Request, init?: RequestInit, incomingCookie?: string) {
    if (typeof input === "string" && incomingCookie !== undefined) {
      // Internal transport path: serve already validated the URL and HTTP
      // method, owns the header pairs, and has snapshotted the cookie field.
      this.incoming = { url: input, init: init ?? {} };
      this.cookieHeader = incomingCookie;
    } else {
      this.request = new Request(input, init?.body ? { ...init, duplex: "half" } : init);
      this.cookieHeader = this.request.headers.get("cookie") ?? "";
    }
  }
  private get webRequest(): Request {
    if (!this.request) {
      const incoming = this.incoming!;
      const init = incoming.init;
      this.request = new Request(incoming.url, { ...init, headers: this.headers, ...(init.body ? { duplex: "half" } : {}) });
    }
    return this.request;
  }
  get nextUrl(): URL { return this.parsedUrl ??= new URL(this.url); }
  get cookies(): RequestCookies { return this.parsedCookies ??= new RequestCookies(this.cookieHeader); }
  get url(): string {
    return this.requestUrl ??= (this.incoming ? this.incoming.url : this.webRequest.url).replace(/^(https?:\/\/)(?:127(?:\.\d+){3}|\[::1\])(?=[:/])/, "$1localhost");
  }
  get method() { return this.incoming ? this.incoming.init.method || "GET" : this.webRequest.method; }
  get headers(): Headers { return this.incoming ? this.parsedHeaders ??= new Headers(this.incoming.init.headers) : this.webRequest.headers; }
  get body() { return this.webRequest.body; }
  get bodyUsed() { return this.webRequest.bodyUsed; }
  get signal() { return this.webRequest.signal; }
  get cache() { return this.webRequest.cache; }
  get credentials() { return this.webRequest.credentials; }
  get destination() { return this.webRequest.destination; }
  get integrity() { return this.webRequest.integrity; }
  get keepalive() { return this.webRequest.keepalive; }
  get mode() { return this.webRequest.mode; }
  get redirect() { return this.webRequest.redirect; }
  get referrer() { return this.webRequest.referrer; }
  get referrerPolicy() { return this.webRequest.referrerPolicy; }
  get duplex() { return this.webRequest.duplex; }
  declare readonly isHistoryNavigation: never;
  declare readonly isReloadNavigation: never;
  json() { return this.webRequest.json(); }
  text() { return this.webRequest.text(); }
  async bytes() { return new Uint8Array(await this.webRequest.arrayBuffer()); }
  arrayBuffer() { return this.webRequest.arrayBuffer(); }
  clone() {
    const clone = this.webRequest.clone();
    // Headers handed to application code retain their identity even after a
    // body/signal getter materializes the Web Request. Clone their current state.
    if (this.incoming) {
      const names: string[] = [];
      clone.headers.forEach((_value, name) => names.push(name));
      for (const name of names) clone.headers.delete(name);
      this.headers.forEach((value, name) => clone.headers.append(name, value));
    }
    return clone;
  }
}

export class NextResponse {
  declare readonly blob: never;
  declare readonly formData: never;
  declare readonly type: never;
  readonly cookies: ResponseCookies;
  private boundedBody: boolean;
  private response: Response;
  constructor(body?: string | Uint8Array | ReadableStream<Uint8Array> | null, init?: ResponseInit) {
    this.response = new Response(body, init);
    this.boundedBody = typeof body === "string" || body instanceof Uint8Array;
    this.cookies = new ResponseCookies(this.response.headers);
  }
  get bufferedBody() { return this.boundedBody; }
  get body() { return this.response.body; }
  get headers() { return this.response.headers; }
  get status() { return this.response.status; }
  get statusText() { return this.response.statusText; }
  get ok() { return this.response.ok; }
  get redirected() { return this.response.redirected; }
  get url() { return this.response.url; }
  get bodyUsed() { return this.response.bodyUsed; }
  text() { return this.response.text(); }
  json() { return this.response.json(); }
  async bytes() { return new Uint8Array(await this.response.arrayBuffer()); }
  arrayBuffer() { return this.response.arrayBuffer(); }
  clone() { return this.response.clone(); }
  static json(body: unknown, init?: ResponseInit): NextResponse {
    const response = Response.json(body, init);
    const result = new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
    // Response.json validates and serializes synchronously; its body is bounded.
    result.boundedBody = true;
    return result;
  }
  static redirect(url: string | URL, init?: number | ResponseInit): NextResponse {
    const status = typeof init === "number" ? init : init?.status ?? 307;
    if (![301, 302, 303, 307, 308].includes(status)) throw new RangeError('Failed to execute "redirect" on "response": Invalid status code');
    const options = typeof init === "object" ? init : undefined;
    const headers = new Headers(options?.headers);
    headers.set("location", new URL(url).href);
    return new NextResponse(null, { ...options, headers, status });
  }
}
