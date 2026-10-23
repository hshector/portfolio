"use client";

import { useState } from "react";

import { cx } from "@/components/ui/primitives";
import { useHasLogo } from "@demo/logos";

const AVATAR = ["var(--av-1)", "var(--av-2)", "var(--av-3)", "var(--av-4)", "var(--av-5)", "var(--av-6)"];

type LogoState = "loading" | "ok" | "none";

/** Round avatar: the company logo when the engine has cached one (/api/logo, from
 *  Logo.dev), otherwise the ticker initials on a soft tint. Logos sit on white with a
 *  hairline ring in both themes, so brand colours never clash with the palette. */
export function AssetAvatar({ t, size = 40, logo = true }: { t: string; size?: number; logo?: boolean }) {
  const [state, setState] = useState<LogoState>(logo ? "loading" : "none");
  // demo: only the logos the public extract has
  const has = useHasLogo(t);
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-bold text-ink/75"
      style={{ width: size, height: size, background: AVATAR[h % AVATAR.length] }}
    >
      {state !== "ok" && t.slice(0, 4)}
      {state !== "none" && has && (
        // A plain <img>: tiny, already-cached files; next/image would add a resize hop for nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${import.meta.env.BASE_URL}data/logos/${encodeURIComponent(t)}.png`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          // A cached image can finish before hydration attaches onLoad / onError.
          ref={(el) => {
            if (el?.complete && state === "loading") setState(el.naturalWidth > 0 ? "ok" : "none");
          }}
          onLoad={() => setState("ok")}
          onError={() => setState("none")}
          className={cx("absolute inset-0 size-full bg-white object-cover transition-opacity duration-150 ease-out", state === "ok" ? "opacity-100" : "opacity-0")}
        />
      )}
      {state === "ok" && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_var(--line-2)]" />}
    </span>
  );
}
