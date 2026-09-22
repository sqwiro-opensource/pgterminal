import { useCallback, useEffect, useRef, useState } from 'react';

export interface DraggableBox {
  /** Offset applied on top of the anchor position. */
  dx: number;
  dy: number;
  dragging: boolean;
  /** Pointer-down handler for the drag handle (usually the header). */
  onHandlePointerDown(e: React.PointerEvent): void;
}

/**
 * Lets an anchored popover be pushed out of the way.
 *
 * The offset is deliberately not persisted and resets whenever the popover reopens: it is
 * anchored to whatever cell was clicked, so yesterday's position means nothing to today's
 * anchor. Buttons inside the handle keep working — a drag only starts on the bare header.
 */
export function useDraggableBox(open: boolean): DraggableBox {
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!open) setOffset({ dx: 0, dy: 0 });
  }, [open]);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Let the header's own controls (view toggle, copy, close) behave normally.
      if ((e.target as HTMLElement).closest('button,[role="separator"],input,select')) return;
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      const box = el.getBoundingClientRect();
      el.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY, dx: offset.dx, dy: offset.dy };
      setDragging(true);

      const move = (ev: PointerEvent): void => {
        const s = start.current;
        if (!s) return;
        // Keep a grabbable strip on screen in every direction.
        const margin = 24;
        const dx = Math.min(window.innerWidth - box.left - margin, Math.max(-box.right + margin, s.dx + (ev.clientX - s.x)));
        const dy = Math.min(window.innerHeight - box.top - margin, Math.max(-box.top + margin, s.dy + (ev.clientY - s.y)));
        setOffset({ dx: Math.round(dx), dy: Math.round(dy) });
      };
      const up = (ev: PointerEvent): void => {
        el.releasePointerCapture(ev.pointerId);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        start.current = null;
        setDragging(false);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    },
    [offset.dx, offset.dy]
  );

  return { ...offset, dragging, onHandlePointerDown };
}
