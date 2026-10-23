"use client";

import { AlertDialog, Dialog } from "radix-ui";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";

import { IconClose } from "@/components/ui/icons";
import { Button, cx } from "@/components/ui/primitives";

// Below `sm` a sheet is a bottom sheet that can be dragged down to dismiss.
const PHONE = "(max-width: 39.999rem)";
// A flick faster than this (px/ms) dismisses regardless of distance.
const FLICK = 0.11;

const SURFACE =
  "sheet fixed inset-x-0 bottom-0 z-50 overflow-y-auto rounded-t-[28px] bg-surface px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[8vh] sm:-translate-x-1/2 sm:rounded-[28px] sm:pt-6";
const OVERLAY = "sheet-overlay fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px]";

/** Drag-to-dismiss on the sheet's header. Moves the element's transform directly
 *  (no state, no re-render per frame); upward drags meet increasing friction. */
function useDragToDismiss(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; id: number } | null>(null);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 300ms var(--ease-drawer)";
    el.style.transform = "";
  };

  return {
    ref,
    handlers: {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        // One finger only; leave the close button and other controls alone.
        if (drag.current || e.button !== 0 || !window.matchMedia(PHONE).matches) return;
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        drag.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        if (ref.current) ref.current.style.transition = "none";
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const d = drag.current;
        if (!d || e.pointerId !== d.id || !ref.current) return;
        const dy = e.clientY - d.y;
        ref.current.style.transform = `translateY(${dy >= 0 ? dy : -Math.sqrt(-dy) * 2}px)`;
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        const d = drag.current;
        if (!d || e.pointerId !== d.id || !ref.current) return;
        drag.current = null;
        const dy = Math.max(0, e.clientY - d.y);
        const velocity = dy / Math.max(1, performance.now() - d.t);
        if (dy > ref.current.offsetHeight * 0.3 || (dy > 12 && velocity > FLICK)) {
          // The exit keyframes have no `from`, so they continue from where the finger left it.
          ref.current.style.transition = "";
          close();
        } else reset();
      },
      onPointerCancel() {
        drag.current = null;
        reset();
      },
    },
  };
}

function Grabber() {
  return <div aria-hidden className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-ink/15 sm:hidden" />;
}

/** Bottom sheet on phones, centred modal from `sm`. Controlled or uncontrolled. */
export function Sheet({
  title,
  description,
  trigger,
  open,
  onOpenChange,
  size = "md",
  children,
}: {
  title: string;
  description?: string;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = (o: boolean) => {
    if (open === undefined) setInner(o);
    onOpenChange?.(o);
  };
  const { ref, handlers } = useDragToDismiss(() => setOpen(false));
  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content ref={ref} className={cx(SURFACE, "max-h-[90dvh]", size === "sm" ? "sm:w-[480px]" : "sm:w-[540px]")}>
          <div {...handlers} className="-mx-6 touch-none px-6 pb-5 pt-1 sm:touch-auto sm:pt-0">
            <Grabber />
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="text-[20px] font-bold">{title}</Dialog.Title>
              <Dialog.Close className="tap rounded-full bg-surface-2 p-2 text-ink-2" aria-label="Close">
                <IconClose size={16} />
              </Dialog.Close>
            </div>
          </div>
          <Dialog.Description className="sr-only">{description ?? title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmation for destructive actions (replaces window.confirm). */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={OVERLAY} />
        <AlertDialog.Content className={cx(SURFACE, "pt-6 sm:top-[30vh] sm:w-[400px]")}>
          <AlertDialog.Title className="text-[19px] font-bold">{title}</AlertDialog.Title>
          <AlertDialog.Description className={cx("mt-1.5 text-[15px] text-ink-2", !description && "sr-only")}>{description ?? title}</AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancelar</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
