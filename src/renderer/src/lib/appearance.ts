import { useEffect } from 'react';
import { useStore } from '@renderer/store';

/** The size the layout is designed against; other sizes scale the whole UI. */
const BASE_UI_FONT_SIZE = 13;

/**
 * Applies the UI font-size setting. Tailwind sizes are fixed px, so scaling the root with
 * `zoom` is what actually makes every surface (trees, grids, chrome) grow together, rather
 * than only the handful of elements that inherit the body size.
 */
export function useAppearance(): void {
  const uiFontSize = useStore((s) => s.settings.uiFontSize);
  useEffect(() => {
    const root = document.documentElement;
    const factor = uiFontSize / BASE_UI_FONT_SIZE;
    root.style.setProperty('--ui-font-size', `${uiFontSize}px`);
    // `zoom` keeps layout maths intact (unlike transform: scale) and is supported by Chromium.
    root.style.zoom = factor === 1 ? '' : String(factor);
    return () => {
      root.style.zoom = '';
    };
  }, [uiFontSize]);
}
