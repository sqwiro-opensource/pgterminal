import { useCallback, useRef, useState } from 'react';
import { useStore } from '@renderer/store';
import type { AppSettings } from '@shared/types/settings';

export interface ResizableBox {
  width: number;
  height: number;
  /** Pointer-down handler for the corner grip. */
  onGripPointerDown(e: React.PointerEvent): void;
  resizing: boolean;
}

/**
 * Drag-to-resize backed by settings, so a size chosen once is the size next time.
 *
 * Pointer capture rather than window listeners: the popover sits inside a Radix layer that
 * stops propagation, and capture keeps the drag alive when the pointer leaves the grip.
 * The committed size is written on release, not on every frame.
 */
export function useResizableBox(
  widthKey: keyof AppSettings & string,
  heightKey: keyof AppSettings & string,
  bounds: { minW: number; minH: number; maxW?: number; maxH?: number }
): ResizableBox {
  const saved = useStore((s) => ({ w: Number(s.settings[widthKey]), h: Number(s.settings[heightKey]) }));
  const [live, setLive] = useState<{ w: number; h: number } | null>(null);
  const start = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const clamp = useCallback(
    (w: number, h: number) => ({
      w: Math.round(Math.min(bounds.maxW ?? Math.max(320, window.innerWidth - 40), Math.max(bounds.minW, w))),
      h: Math.round(Math.min(bounds.maxH ?? Math.max(200, window.innerHeight - 80), Math.max(bounds.minH, h)))
    }),
    [bounds.maxH, bounds.maxW, bounds.minH, bounds.minW]
  );

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY, w: saved.w, h: saved.h };

      const move = (ev: PointerEvent): void => {
        if (!start.current) return;
        setLive(clamp(start.current.w + (ev.clientX - start.current.x), start.current.h + (ev.clientY - start.current.y)));
      };
      const up = (ev: PointerEvent): void => {
        el.releasePointerCapture(ev.pointerId);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        setLive((cur) => {
          if (cur) void useStore.getState().updateSettings({ [widthKey]: cur.w, [heightKey]: cur.h } as Partial<AppSettings>);
          return null;
        });
        start.current = null;
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    },
    [clamp, heightKey, saved.h, saved.w, widthKey]
  );

  return { width: live?.w ?? saved.w, height: live?.h ?? saved.h, onGripPointerDown, resizing: live !== null };
}
