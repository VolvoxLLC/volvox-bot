'use client';

import { useEffect } from 'react';

/**
 * Attaches pointermove tracking to all `.glow-card` elements on the page,
 * setting `--mouse-x` and `--mouse-y` CSS custom properties as percentages
 * relative to each card. This powers the radial-gradient glow effect in
 * globals.css. Updates are throttled via requestAnimationFrame.
 */
export function useGlowCard(): void {
  useEffect(() => {
    let rafId: number | null = null;

    function handlePointerMove(e: PointerEvent): void {
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;

        const cards = document.querySelectorAll<HTMLElement>('.glow-card');
        for (const card of cards) {
          const rect = card.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          card.style.setProperty('--mouse-x', `${x}%`);
          card.style.setProperty('--mouse-y', `${y}%`);
        }
      });
    }

    document.addEventListener('pointermove', handlePointerMove);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);
}
