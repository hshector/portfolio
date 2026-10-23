import "server-only";

import { allowedEmails, supabaseBaseUrl } from "./env";

// Deployment self-check shown at /setup/check. Never returns secret values.
// The page is reachable without signing in, because it is how you fix a sign-in that does
// not work yet. Visitors who are not signed in (once Supabase is configured) get only what
// sign-in depends on: no call is made with the secret key and nothing about your data,
// tables or allowlist is disclosed. The full check needs an allowed, signed-in user.

export type Check = { name: string; ok: boolean; detail: string; warn?: boolean };

const VERCEL_VARS = "Vercel → project → Settings → Environments → Production";
const KEYS_PAGE = "Supabase → Project Settings → API Keys";

export function keyKind(key: string | undefined): "secret" | "publishable" | "service_role" | "anon" | "missing" | "unknown" {
  const k = (key ?? "").trim();
  if (!k) return "missing";
  if (k.startsWith("sb_secret_")) return "secret";
  if (k.startsWith("sb_publishable_")) return "publishable";
  if (k.startsWith("eyJ") && k.split(".").length === 3) {
    try {
      const role = JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role;
      return role === "service_role" || role === "anon" ? role : "unknown";
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

async function get(url: string, key: string) {
  try {
    const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: e instanceof Error ? e.name : "error" };
  }
}

export async function runDoctor({ full }: { full: boolean }): Promise<Check[]> {
  const out: Check[] = [];
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pub = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const sec = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  const url = rawUrl ? supabaseBaseUrl(rawUrl) : "";
  const urlOk = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url);
  out.push({
    name: "NEXT_PUBLIC_SUPABASE_URL",
    ok: urlOk,
    detail: !rawUrl ? `Missing. Add it in ${VERCEL_VARS} (type Config).` : urlOk ? "Format OK." : "Not of the form https://<ref>.supabase.co (Supabase → Project Settings → Data API → Project URL).",
  });

  const pk = keyKind(pub);
  out.push({
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ok: pk === "publishable" || pk === "anon",
    detail:
      pk === "missing"
        ? `Missing. Add it in ${VERCEL_VARS} (type Config). Value: ${KEYS_PAGE} → Publishable key.`
        : pk === "secret" || pk === "service_role"
          ? `You put the SECRET key here! Delete it and use the Publishable key (${KEYS_PAGE}). Then rotate the secret key in Supabase.`
          : pk === "publishable" || pk === "anon"
            ? "This is the public key."
            : `This does not look like a Supabase key. Correct value: ${KEYS_PAGE} → Publishable key.`,
  });

  const sk = keyKind(sec);
  if (full) out.push({
    name: "SUPABASE_SECRET_KEY",
    ok: sk === "secret" || sk === "service_role",
    detail:
      sk === "missing"
        ? `Missing. Add it in ${VERCEL_VARS} (type Secret). Value: ${KEYS_PAGE} → Secret keys.`
        : sk === "publishable" || sk === "anon"
          ? `You put the public key. This needs the Secret key (sb_secret_…) from ${KEYS_PAGE}.`
          : sk === "secret" || sk === "service_role"
            ? "This is an admin key."
            : `This does not look like a Supabase key. Correct value: ${KEYS_PAGE} → Secret keys.`,
  });

  const emails = allowedEmails();
  out.push({
    name: "ALLOWED_EMAILS",
    ok: emails.length > 0,
    detail: !emails.length ? `Missing. Add your email in ${VERCEL_VARS}.` : full ? `${emails.length} allowed email(s).` : "Set.",
  });

  if (!urlOk) return out;

  if (pk === "publishable" || pk === "anon") {
    const r = await get(`${url}/auth/v1/settings`, pub);
    let emailOn = false;
    try {
      emailOn = Boolean(JSON.parse(r.text)?.external?.email);
    } catch {}
    out.push({
      name: "Login (Supabase Auth)",
      ok: r.status === 200 && emailOn,
      detail:
        r.status === 200
          ? emailOn
            ? "Supabase accepts the public key and email sign-in is on."
            : "Email sign-in is off: Supabase → Authentication → Sign In / Providers → Email → enable."
          : r.status === 401 || r.status === 403
            ? `Supabase rejects the public key (${r.status}). Copy it again from ${KEYS_PAGE} → Publishable key.`
            : `Supabase answered ${r.status || "no connection"}.`,
    });
  }

  if (full && (sk === "secret" || sk === "service_role")) {
    const db = await get(`${url}/rest/v1/settings?select=user_id&limit=1`, sec);
    out.push({
      name: "Database",
      ok: db.status === 200,
      detail:
        db.status === 200
          ? "Tables created."
          : db.status === 404 || db.text.includes("PGRST205")
            ? "Tables missing: run the files in supabase/migrations in Supabase → SQL Editor."
            : db.status === 401 || db.status === 403
              ? `Supabase rejects the secret key (${db.status}). Copy it again from ${KEYS_PAGE} → Secret keys.`
              : `Supabase answered ${db.status || "no connection"}.`,
    });
    const bucket = process.env.SUPABASE_BUCKET || "market";
    const b = await get(`${url}/storage/v1/bucket/${bucket}`, sec);
    out.push({
      name: "Data storage",
      ok: b.status === 200,
      detail: b.status === 200 ? `The '${bucket}' bucket exists.` : `The '${bucket}' bucket was not found (${b.status}): run supabase/migrations/0001_init.sql.`,
    });
    if (b.status === 200) {
      const l = await get(`${url}/storage/v1/object/${bucket}/published/latest.json`, sec);
      out.push({
        name: "Market data",
        ok: l.status === 200,
        warn: l.status !== 200,
        detail: l.status === 200 ? "Data has been published." : "No data yet: it appears when the first download finishes in GitHub Actions.",
      });
    }
  }
  return out;
}
