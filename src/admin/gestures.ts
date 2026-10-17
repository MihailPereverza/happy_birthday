import { useEffect, useRef } from 'preact/hooks';

export const LONG_PRESS_MS = 3000;
export const TRIPLE_TAP_WINDOW_MS = 700;

/** Pointer handlers firing `onLongPress` after the element is held for `ms` without moving away. */
export function useLongPress(onLongPress: () => void, ms = LONG_PRESS_MS) {
  const timer = useRef<number | undefined>(undefined);
  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: () => {
      cancel();
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        navigator.vibrate?.(60);
        onLongPress();
      }, ms);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: Event) => e.preventDefault(),
  };
}

/** Click handler firing `onTripleTap` on three taps within the window. */
export function useTripleTap(onTripleTap: () => void, windowMs = TRIPLE_TAP_WINDOW_MS) {
  const taps = useRef<number[]>([]);
  return () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < windowMs), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      onTripleTap();
    }
  };
}
