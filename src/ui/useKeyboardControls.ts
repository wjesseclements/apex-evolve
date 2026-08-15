import { useEffect, useRef, type RefObject } from 'react';
import type { CarControls } from '../sim/physics/car.ts';

const DRIVING_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Arrow-key car controls written into `controlsRef` (read by the sim loop
 * every tick, never causing React re-renders):
 *   ↑ throttle +1   ↓ throttle −1 (brake)   ← steering −1 (left)   → steering +1 (right)
 * Opposite keys held together cancel out. Other keys are reported to `onKey`
 * (lower-cased, no modifiers, no auto-repeat), e.g. 'r' reset, 'd' debug.
 */
export function useKeyboardControls(
  controlsRef: RefObject<CarControls>,
  onKey: (key: string) => void,
): void {
  const onKeyRef = useRef(onKey);
  useEffect(() => {
    onKeyRef.current = onKey;
  });

  useEffect(() => {
    const held = new Set<string>();
    const recompute = () => {
      const steering = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
      const throttle = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
      controlsRef.current = { steering, throttle };
    };
    const down = (e: KeyboardEvent) => {
      if (DRIVING_KEYS.has(e.key)) {
        e.preventDefault(); // keep arrows from scrolling the page
        held.add(e.key);
        recompute();
      } else if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        onKeyRef.current(e.key.toLowerCase());
      }
    };
    const up = (e: KeyboardEvent) => {
      if (DRIVING_KEYS.has(e.key)) {
        held.delete(e.key);
        recompute();
      }
    };
    const blur = () => {
      held.clear();
      recompute();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [controlsRef]);
}
