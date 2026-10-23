"use server";

import { revalidatePath } from "next/cache";
import webpush from "web-push";
import { z } from "zod";

import { requireStore } from "@/lib/user/store";

type Result = { ok: boolean; message: string };

const SubSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  device: z.string().trim().max(120).optional(),
});

const MISSING_TABLE = "Notifications need the database update: run supabase/migrations/0003_cash_notifications.sql in Supabase → SQL Editor.";

function fail(e: unknown): Result {
  console.error("notify:", e);
  const m = e instanceof Error ? e.message : "";
  return { ok: false, message: /tables are missing|update missing/i.test(m) ? MISSING_TABLE : m || "Could not save" };
}

export async function subscribePush(raw: unknown): Promise<Result> {
  const p = SubSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: "This browser returned an invalid subscription" };
  try {
    const store = await requireStore();
    await store.savePushSubscription({ endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, device: p.data.device ?? null });
    revalidatePath("/settings");
    return { ok: true, message: "Notifications on for this device" };
  } catch (e) {
    return fail(e);
  }
}

export async function unsubscribePush(endpoint: string): Promise<Result> {
  if (!/^https:\/\//.test(endpoint)) return { ok: false, message: "Invalid device" };
  try {
    const store = await requireStore();
    await store.deletePushSubscription(endpoint);
    revalidatePath("/settings");
    return { ok: true, message: "Notifications off for this device" };
  } catch (e) {
    return fail(e);
  }
}

const PrefsSchema = z.object({ holdings: z.boolean(), watchlist: z.boolean(), candidates: z.boolean() });

export async function saveNotifyPrefs(raw: unknown): Promise<Result> {
  const p = PrefsSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: "Invalid preferences" };
  try {
    const store = await requireStore();
    await store.saveNotify(p.data);
    revalidatePath("/settings");
    revalidatePath("/alerts");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}

/** Server-side test message to every device of this user (same path as the daily job, but from Vercel). */
export async function sendTestPush(): Promise<Result> {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  let subject = process.env.VAPID_SUBJECT || "";
  if (!pub || !priv || !subject) return { ok: false, message: "Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT in Vercel" };
  if (!/^(mailto:|https:\/\/)/.test(subject)) subject = `mailto:${subject}`;
  try {
    const store = await requireStore();
    const subs = await store.pushSubscriptions();
    if (!subs.length) return { ok: false, message: "No device has notifications on yet" };
    webpush.setVapidDetails(subject, pub, priv);
    const payload = JSON.stringify({ title: "WarrenIA test", body: "Notifications work. You will hear about signal changes after each daily update.", url: "/alerts", tag: "test" });
    let ok = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600 });
        ok++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await store.deletePushSubscription(s.endpoint);
        else console.error("push test:", status, e);
      }
    }
    return ok ? { ok: true, message: `Sent to ${ok} device${ok > 1 ? "s" : ""}` } : { ok: false, message: "The push service rejected it: turn notifications off and on again" };
  } catch (e) {
    return fail(e);
  }
}
