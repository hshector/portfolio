/** Only same-origin absolute paths ("/x"); rejects "//host" and "/\host" (open redirect). */
export function safeNext(raw: string | null | undefined): string {
  return raw && /^\/(?![\\/])/.test(raw) ? raw : "/";
}
