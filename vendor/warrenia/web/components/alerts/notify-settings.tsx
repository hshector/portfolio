"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";

import { saveNotifyPrefs, sendTestPush, subscribePush, unsubscribePush } from "@/app/(app)/alerts/actions";
import { Button, Callout, cx } from "@/components/ui/primitives";
import type { NotifyPrefs } from "@/lib/market/signals";

type Support = "checking" | "ok" | "unsupported" | "ios-browser";

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: ArrayBuffer): string {
  let s = "";
  for (const c of new Uint8Array(b)) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${os} · ${br}`;
}

function Switch({ on, label, help, onChange, disabled }: { on: boolean; label: string; help: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="tap flex w-full items-center justify-between gap-4 py-3 text-left disabled:opacity-50"
    >
      <span>
        <span className="block text-[15px]">{label}</span>
        <span className="block text-[13px] text-ink-3">{help}</span>
      </span>
      <span className={cx("relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200", on ? "bg-accent" : "bg-surface-3")}>
        <span
          className={cx(
            "absolute top-[3px] h-6 w-6 rounded-full bg-surface shadow-[var(--shadow-card)] transition-transform duration-200 ease-out",
            on ? "translate-x-[23px]" : "translate-x-[3px]",
          )}
        />
      </span>
    </button>
  );
}

/** One-time key pair for Web Push, generated in this browser: nothing is sent anywhere. */
function KeyGenerator() {
  const [keys, setKeys] = useState<{ pub: string; priv: string } | null>(null);
  async function generate() {
    const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = bytesToB64url(await crypto.subtle.exportKey("raw", k.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
    setKeys({ pub, priv: jwk.d ?? "" });
  }
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast.success("Copied"));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-ink-2">
        Notifications need a key pair, made once. Generate it here (it never leaves this browser) and paste it where shown. The full steps are in docs/GUIA.md.
      </p>
      {!keys ? (
        <Button className="tap self-start" onClick={generate}>
          Generate keys
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          {(
            [
              ["Public key", keys.pub, "Vercel: NEXT_PUBLIC_VAPID_PUBLIC_KEY"],
              ["Private key (secret)", keys.priv, "Vercel: VAPID_PRIVATE_KEY · GitHub secret: VAPID_PRIVATE_KEY"],
            ] as const
          ).map(([label, v, where]) => (
            <div key={label} className="rounded-[14px] bg-surface-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-medium">{label}</span>
                <Button size="sm" className="tap" onClick={() => copy(v)}>
                  Copy
                </Button>
              </div>
              <p className="num mt-1 select-all break-all font-mono text-[12.5px] text-ink-2">{v}</p>
              <p className="mt-1 text-[12.5px] text-ink-3">{where}</p>
            </div>
          ))}
          <p className="text-[13px] text-ink-3">
            Also add VAPID_SUBJECT = your e-mail (Vercel and GitHub), then redeploy Vercel. Keep the private key secret; if it leaks, generate a new pair and turn
            notifications on again.
          </p>
        </div>
      )}
    </div>
  );
}

const noop = () => () => undefined;

function detectSupport(): Support {
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (ok) return "ok";
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone ? "ios-browser" : "unsupported";
}

export function NotifySettings({ publicKey, prefs, devices }: { publicKey: string | null; prefs: NotifyPrefs; devices: number }) {
  const support = useSyncExternalStore(noop, detectSupport, () => "checking" as Support);
  const [perm, setPerm] = useState<NotificationPermission | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [p, setP] = useState(prefs);
  const [pending, start] = useTransition();
  const permission = perm ?? (support === "ok" ? Notification.permission : "default");

  useEffect(() => {
    if (support !== "ok") return;
    navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription().then(setSub));
  }, [support]);

  const turnOn = () =>
    start(async () => {
      if (!publicKey) return;
      const res = await Notification.requestPermission();
      setPerm(res);
      if (res !== "granted") {
        toast.error("Notifications were not allowed");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      try {
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) });
        const r = await subscribePush({ ...s.toJSON(), device: deviceName() });
        if (r.ok) {
          setSub(s);
          toast.success(r.message);
        } else {
          await s.unsubscribe();
          toast.error(r.message);
        }
      } catch (e) {
        console.error(e);
        toast.error("This browser could not turn notifications on");
      }
    });

  const turnOff = () =>
    start(async () => {
      if (!sub) return;
      const r = await unsubscribePush(sub.endpoint);
      await sub.unsubscribe().catch(() => undefined);
      setSub(null);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  const setPref = (k: keyof NotifyPrefs, v: boolean) => {
    const next = { ...p, [k]: v };
    setP(next);
    start(async () => {
      const r = await saveNotifyPrefs(next);
      if (!r.ok) {
        setP(p);
        toast.error(r.message);
      }
    });
  };

  const test = () =>
    start(async () => {
      const r = await sendTestPush();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="card px-5 py-4">
        <p className="text-[15px] font-medium">This device</p>
        <div className="mt-2 flex flex-col gap-3">
          {support === "checking" && <p className="text-[14px] text-ink-3">Checking…</p>}
          {support === "ios-browser" && (
            <Callout tone="info" title="Add WarrenIA to your Home Screen first">
              On iPhone, notifications only work in the installed app: Safari → Share → Add to Home Screen, then open WarrenIA from that icon and come back here.
            </Callout>
          )}
          {support === "unsupported" && <Callout tone="warn">This browser does not support notifications. Use Chrome, Edge, Firefox or Safari 16.4+.</Callout>}
          {support === "ok" && !publicKey && <KeyGenerator />}
          {support === "ok" && publicKey && permission === "denied" && (
            <Callout tone="warn" title="Blocked in the browser">
              Notifications are blocked for this site. Allow them in the browser or phone settings (Notifications → WarrenIA), then reload.
            </Callout>
          )}
          {support === "ok" && publicKey && permission !== "denied" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14.5px] text-ink-2">
                <span className={cx("mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle", sub ? "bg-pos" : "bg-ink-3")} />
                {sub ? "On for this device" : "Off for this device"}
              </p>
              <div className="flex gap-2">
                {sub && (
                  <Button className="tap" disabled={pending} onClick={test}>
                    Send a test
                  </Button>
                )}
                <Button variant={sub ? "secondary" : "primary"} className="tap" disabled={pending} onClick={sub ? turnOff : turnOn}>
                  {sub ? "Turn off" : "Turn on"}
                </Button>
              </div>
            </div>
          )}
          <p className="text-[13px] text-ink-3">
            {devices === 0 ? "No device receives notifications yet." : `${devices} device${devices > 1 ? "s" : ""} receive${devices > 1 ? "" : "s"} notifications.`} They
            arrive once a day, after the early-morning update (Spanish time), only when something that concerns you changed.
          </p>
        </div>
      </div>
      <div className="card divide-y divide-line px-5 py-1">
        <Switch on={p.holdings} label="Stocks you own" help="Any change, and above all when the rule says “consider selling”" onChange={(v) => setPref("holdings", v)} disabled={pending} />
        <Switch on={p.watchlist} label="Stocks you follow" help="When their signal changes (e.g. Watch → Buy candidate)" onChange={(v) => setPref("watchlist", v)} disabled={pending} />
        <Switch on={p.candidates} label="New buy candidates" help="Stocks that just became a buy candidate, in one line" onChange={(v) => setPref("candidates", v)} disabled={pending} />
      </div>
    </div>
  );
}
