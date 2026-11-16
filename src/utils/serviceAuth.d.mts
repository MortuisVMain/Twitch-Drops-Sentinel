export const TOKEN_HEADER: string;
export function withServiceToken(url: string, win?: { __SENTINEL_TOKEN?: unknown }): string;
export function installServiceAuth(win?: { fetch: typeof fetch; __SENTINEL_TOKEN?: unknown }): void;
