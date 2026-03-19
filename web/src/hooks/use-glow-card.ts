'use client';

import { useEffect } from 'react';

/**
 * Attaches pointermove tracking to all `.glow-card` elements on the page,
 * setting `--mouse-x` and `--mouse-y` CSS custom properties as percentages
 * relative to each card. This powers the radial-gradient glow effect in
 * globals.css. Updates are throttled via requestAnimationFrame.
 *
 * Card references are cached to avoid repeated DOM queries on every frame.
 * The cache is invalidated after 2 s so newly mounted cards are picked up.
 */

let cards: NodeListOf<HTMLElement> | null = null;
let cacheTimeout: ReturnType<typeof setTimeout> | null = null;

function getCards(): NodeListOf<HTMLElement> {
  if (!cards) {
    cards = document.querySelectorAll<HTMLElement>('.glow-card');
    if (cacheTimeout) clearTimeout(cacheTimeout);
    cacheTimeout = setTimeout(() => {
      cards = null;
    }, 2000);
  }
  return cards;
}

export function useGlowCard(): void {
  useEffect(() => {
    let rafId: number | null = null;

    function handlePointerMove(e: PointerEvent): void {
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;

        for (const card of getCards()) {
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
