import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { GUILD_SELECTED_EVENT, SELECTED_GUILD_KEY } from '@/lib/guild-selection';

describe('useGuildSelection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates the selected guild from localStorage', async () => {
    localStorage.setItem(SELECTED_GUILD_KEY, 'guild-1');

    const { result } = renderHook(() => useGuildSelection());

    await waitFor(() => {
      expect(result.current).toBe('guild-1');
    });
  });

  it('updates the selection and fires onGuildChange for custom events', async () => {
    const onGuildChange = vi.fn();
    const { result } = renderHook(() => useGuildSelection({ onGuildChange }));

    act(() => {
      window.dispatchEvent(new CustomEvent(GUILD_SELECTED_EVENT, { detail: 'guild-2' }));
    });

    await waitFor(() => {
      expect(result.current).toBe('guild-2');
    });
    expect(onGuildChange).toHaveBeenCalledTimes(1);
  });

  it('updates the selection for storage events on the selected guild key', async () => {
    const onGuildChange = vi.fn();
    const { result } = renderHook(() => useGuildSelection({ onGuildChange }));

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SELECTED_GUILD_KEY,
          newValue: 'guild-3',
        }),
      );
    });

    await waitFor(() => {
      expect(result.current).toBe('guild-3');
    });
    expect(onGuildChange).toHaveBeenCalledTimes(1);
  });

  it('ignores empty custom event and unrelated storage changes', async () => {
    const onGuildChange = vi.fn();
    const { result } = renderHook(() => useGuildSelection({ onGuildChange }));

    act(() => {
      window.dispatchEvent(new CustomEvent(GUILD_SELECTED_EVENT, { detail: '' }));
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'other-key',
          newValue: 'guild-4',
        }),
      );
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SELECTED_GUILD_KEY,
          newValue: null,
        }),
      );
    });

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
    expect(onGuildChange).not.toHaveBeenCalled();
  });

  it('survives localStorage access errors', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    const { result } = renderHook(() => useGuildSelection());

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });
});
