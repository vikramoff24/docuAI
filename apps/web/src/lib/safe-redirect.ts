/**
 * Only same-origin paths may be used as a post-login destination; anything
 * else ("//evil.com", "https://…", "/\\evil.com") falls back to the dashboard.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
