// WarrenIA in the pavilion: the real app (src/warrenia-app, at /warrenia-app/) in a frame over the
// screen. Its routes live in the frame's hash; the island mirrors them as #warrenia/<route>
// (#warrenia/radar, #warrenia/research/AAPL), so a link opens the same screen.

export interface Demo {
  /** Show a route of the app ("/", "/radar", "/research/AAPL"…). */
  show(path: string): void;
  /** The route the app is on. */
  readonly path: string;
}

/** The screen the app opens on: the radar, as on the wall. */
export const START = '/radar';
/** Old links from the first demo (#warrenia/cartera…) still land on the right screen. */
const ALIASES: Record<string, string> = { '/inicio': '/', '/cartera': '/portfolio' };
/** The app's route in an island address (#warrenia → none: the app opens on START). */
export const appPath = (rest: string | undefined) => (rest && rest !== '/' ? (ALIASES[rest] ?? rest) : undefined);

export function mountDemo(host: HTMLElement, opts: { onClose(): void; onRoute(path: string): void }): Promise<Demo> {
  const frame = document.createElement('iframe');
  frame.title = 'WarrenIA (demo)';
  frame.src = `/warrenia-app/#${START}`;
  host.append(frame);
  host.querySelector('[data-warrenia-close]')!.addEventListener('click', opts.onClose);
  const full = host.querySelector<HTMLAnchorElement>('[data-warrenia-full]')!;
  full.href = `/warrenia-app/#${START}`;
  let path = START;
  const read = () => {
    const h = frame.contentWindow?.location.hash.replace(/^#/, '') || '/';
    if (h === path) return;
    path = h;
    full.href = `/warrenia-app/#${path}`;
    opts.onRoute(path);
  };
  return new Promise((resolve) => {
    frame.addEventListener('load', () => {
      const win = frame.contentWindow!;
      win.addEventListener('hashchange', read);
      // Escape inside the app (outside a form field) also goes back to the bull
      win.addEventListener('keydown', (e) => {
        const t = e.target as HTMLElement;
        if (e.key === 'Escape' && !t.closest?.('input, select, textarea, [role="dialog"]')) opts.onClose();
      });
      resolve({
        show(p: string) {
          if (p === path) return;
          path = p;
          full.href = `/warrenia-app/#${p}`;
          // (replace: Back inside the app should not return to the screen it opened on; the address is
          // absolute because a relative one would resolve against the island's page, not the app's)
          win.location.replace(`/warrenia-app/#${p}`);
        },
        get path() { return path; },
      });
    }, { once: true });
  });
}
