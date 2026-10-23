"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

/** App-wide toasts. Top-centre: at the bottom they would fight the tab bar on phones,
 *  and on a phone they slide in where iOS banners do (swipe up to dismiss). */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      offset={{ top: 76 }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      gap={8}
      toastOptions={{
        style: {
          borderRadius: 18,
          border: "none",
          boxShadow: "0 1px 2px rgb(17 17 17 / 0.06), 0 8px 28px rgb(17 17 17 / 0.12)",
          fontFamily: "var(--font-sans)",
          fontSize: 14.5,
          color: "var(--ink)",
          background: "var(--surface)",
        },
      }}
    />
  );
}
