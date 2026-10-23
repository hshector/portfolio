"use client";

import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { Segmented } from "@/components/ui/primitives";

type Choice = "system" | "light" | "dark";

// Status bar / browser chrome colour: the canvas of each theme.
const BAR = { light: "#f3f4f1", dark: "#000000" } as const;

/** Light / dark / follow the phone. The class is set before first paint (no flash). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="warrenia-theme">
      <ThemeColor />
      {children}
    </NextThemes>
  );
}

/** The <meta name="theme-color"> tags follow the OS by media query; a manual choice overrides both. */
function ThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = BAR[resolvedTheme === "dark" ? "dark" : "light"];
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme]);
  return null;
}

/** Re-renders when the theme class on <html> changes, after the new CSS variables apply
 *  (for components that read tokens once, like charts). */
export function useThemeClass(): string {
  return useSyncExternalStore(
    (onChange) => {
      const mo = new MutationObserver(onChange);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => mo.disconnect();
    },
    () => document.documentElement.className,
    () => "",
  );
}

/** Ajustes → Apariencia. */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // The stored choice is only known in the browser: the server renders "Automatic".
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <Segmented<Choice>
      ariaLabel="Appearance"
      value={mounted ? ((theme as Choice) ?? "system") : "system"}
      onChange={setTheme}
      options={[
        { value: "system", label: "Automatic" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
      className="w-full"
    />
  );
}
