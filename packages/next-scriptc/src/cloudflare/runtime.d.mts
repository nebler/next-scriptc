export declare function dispatchCloudflare(input: string, js: (input: string) => string, lane?: string): string;
export declare function cloudflareStatus(): { available: boolean; buckets: Record<string, number>; memoryBytes: number };
