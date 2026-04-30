import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGlowCard } from '@/hooks/use-glow-card';

describe('useGlowCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('updates glow-card pointer CSS variables', () => {
    const requestAnimationFrameSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    const { unmount } = renderHook(() => useGlowCard());

    const card = document.createElement('div');
    card.className = 'glow-card';
    card.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      toJSON: vi.fn(),
    }));
    const child = document.createElement('button');
    card.append(child);
    document.body.append(card);

    child.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 110,
        clientY: 70,
      }),
    );

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(card.style.getPropertyValue('--mouse-x')).toBe('50%');
    expect(card.style.getPropertyValue('--mouse-y')).toBe('50%');

    unmount();
  });

  it('removes the pointer listener and cancels pending frames on unmount', () => {
    const requestAnimationFrameSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockReturnValue(7);
    const cancelAnimationFrameSpy = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => {});

    const { unmount } = renderHook(() => useGlowCard());
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));

    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(7);
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });
});
