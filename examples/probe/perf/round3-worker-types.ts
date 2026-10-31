// Deliberately bounded GET-only probe; not a production Request/Response codec.
export type Job = { url: string; slug: string; headers: Record<string, string> };
export type Reply = { status: number; headers: Record<string, string>; body: string };
