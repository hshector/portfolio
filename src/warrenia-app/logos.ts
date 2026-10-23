// Which companies have a logo in the public extract (data/logos/index.json), so the app's avatars
// only ask for the logos that exist (the real app gets a 404 from its own API instead).
import { useSyncExternalStore } from 'react';

let have: Set<string> | null = null;
const listeners = new Set<() => void>();
fetch(`${import.meta.env.BASE_URL}data/logos/index.json`)
  .then((r) => (r.ok ? r.json() : { have: [] }))
  .catch(() => ({ have: [] }))
  .then((d: { have: string[] }) => {
    have = new Set(d.have);
    listeners.forEach((l) => l());
  });

/** true / false once the list is in; undefined until then. */
export function useHasLogo(ticker: string): boolean | undefined {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => (have ? have.has(ticker) : undefined),
  );
}
