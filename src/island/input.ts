// Steering the bull with whatever the visitor has: keyboard, mouse, a touch joystick or a gamepad.
// Every source ends up as the same three numbers: forward (-1…1), turn (-1…1, left positive)
// and run (0…1: 0 walks, 1 gallops; analog sticks and the joystick give everything in between).

export interface Steer {
  forward: number;
  turn: number;
  run: number;
  /** Which device moved the bull last (for the on-screen hint). */
  device: 'keyboard' | 'mouse' | 'touch' | 'gamepad' | null;
}

export interface InputHandlers {
  /** E, Enter or the gamepad's A button: enter the place the bull is at. */
  onAction(): void;
  /** M or the gamepad's Back/Select: open the map. */
  onMap(): void;
  /** V: switch between following the bull and the satellite view. */
  onView(): void;
}

const KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];

export function createInput(canvas: HTMLCanvasElement, joystick: HTMLElement, handlers: InputHandlers) {
  const keys = new Set<string>();
  const steer: Steer = { forward: 0, turn: 0, run: 0, device: null };
  const typing = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };

  addEventListener('keydown', (e) => {
    if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (KEYS.includes(k)) {
      keys.add(k);
      steer.device = 'keyboard';
      // arrows would scroll the page: only when the island has focus or nothing else does
      if (k.startsWith('arrow') && (document.activeElement === canvas || document.activeElement === document.body)) e.preventDefault();
    } else if ((k === 'e' || k === 'enter') && document.activeElement !== null && !(document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLAnchorElement)) handlers.onAction();
    else if (k === 'm') handlers.onMap();
    else if (k === 'v') handlers.onView();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  // mouse: hold and drag on the island (up to go, sideways to turn, further for faster)
  // touch: a joystick appears where the thumb lands
  const drag = { id: -1, x0: 0, y0: 0, dx: 0, dy: 0, touch: false };
  const R = 56; // joystick radius in CSS px
  canvas.addEventListener('pointerdown', (e) => {
    if (drag.id !== -1) return;
    drag.id = e.pointerId; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.dx = drag.dy = 0;
    drag.touch = e.pointerType !== 'mouse';
    steer.device = drag.touch ? 'touch' : 'mouse';
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    if (drag.touch) {
      const r = canvas.getBoundingClientRect();
      joystick.style.left = `${e.clientX - r.left}px`; joystick.style.top = `${e.clientY - r.top}px`;
      joystick.hidden = false;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag.id) return;
    const scale = drag.touch ? R : 120;
    let dx = (e.clientX - drag.x0) / scale, dy = (e.clientY - drag.y0) / scale;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    drag.dx = dx; drag.dy = dy;
    if (drag.touch) joystick.style.setProperty('--kx', `${dx * R}px`), joystick.style.setProperty('--ky', `${dy * R}px`);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== drag.id) return;
    drag.id = -1; drag.dx = drag.dy = 0;
    joystick.hidden = true;
    joystick.style.setProperty('--kx', '0px'); joystick.style.setProperty('--ky', '0px');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // gamepad: left stick steers, the right trigger (or RB) gallops, A enters, Back opens the map
  let padA = false, padBack = false, padY = false;
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      const x = dead(p.axes[0] ?? 0), y = dead(p.axes[1] ?? 0);
      const trig = Math.max(p.buttons[7]?.value ?? 0, p.buttons[5]?.pressed ? 1 : 0);
      const a = !!p.buttons[0]?.pressed, back = !!p.buttons[8]?.pressed, yb = !!p.buttons[3]?.pressed;
      if (a && !padA) handlers.onAction();
      if (back && !padBack) handlers.onMap();
      if (yb && !padY) handlers.onView();
      padA = a; padBack = back; padY = yb;
      if (x || y || trig) return { x, y, trig };
    }
    return null;
  }

  return {
    steer,
    /** Reads every device; call once per frame. */
    poll(): Steer {
      let forward = 0, turn = 0, run = 0;
      const k = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);
      forward = k('w', 'arrowup') - k('s', 'arrowdown');
      turn = k('a', 'arrowleft') - k('d', 'arrowright');
      run = keys.has('shift') ? 1 : 0;
      if (drag.id !== -1) {
        // pushing the stick: the further, the faster; past three quarters it gallops
        const m = Math.hypot(drag.dx, drag.dy);
        forward = -drag.dy > -0.25 ? Math.max(0, Math.min(1, m * 1.6)) : -Math.min(1, m * 1.6);
        turn = -drag.dx * 1.4;
        run = Math.max(0, (m - 0.55) / 0.45);
      }
      const pad = pollPad();
      if (pad) {
        const m = Math.min(1, Math.hypot(pad.x, pad.y));
        forward = pad.y <= 0.25 ? m : -m;
        turn = -pad.x * 1.2;
        run = Math.max(pad.trig, (m - 0.7) / 0.3);
        steer.device = 'gamepad';
      }
      steer.forward = Math.max(-1, Math.min(1, forward));
      steer.turn = Math.max(-1, Math.min(1, turn));
      steer.run = Math.max(0, Math.min(1, run));
      return steer;
    },
    active() { return steer.forward !== 0 || steer.turn !== 0; },
  };
}
