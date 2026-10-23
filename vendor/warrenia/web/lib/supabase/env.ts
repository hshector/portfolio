// Which auth / persistence mode the app runs in.
//  supabase      : production — Supabase Auth + Postgres with RLS
//  local         : development on your machine only (JSON file, no login); never on Vercel
//  misconfigured : deployed without Supabase — the app refuses to show data (fail closed)

export type AppMode = "supabase" | "local" | "misconfigured";

/** Project URL without trailing slash or a pasted API path (/rest/v1, …). */
export function supabaseBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/(rest|storage|auth)\/v1$/, "");
}

export function supabasePublicEnv() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = raw ? supabaseBaseUrl(raw) : undefined;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  try {
    if (new URL(url).protocol !== "https:" && !url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) return null;
  } catch {
    return null; // malformed URL: fail closed into /setup instead of crashing every request
  }
  return { url, key };
}

export function appMode(): AppMode {
  // On Vercel an empty allowlist would silently lock everyone out: surface it as a setup problem.
  if (supabasePublicEnv() && (!process.env.VERCEL || allowedEmails().length)) return "supabase";
  if (!process.env.VERCEL && (process.env.NODE_ENV !== "production" || process.env.WARRENIA_LOCAL_MODE === "1")) return "local";
  return "misconfigured";
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  const list = allowedEmails();
  if (!email) return false;
  // With Supabase configured an empty allowlist means nobody is allowed (fail closed).
  return list.includes(email.toLowerCase());
}
