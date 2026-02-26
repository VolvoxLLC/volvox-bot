import { useEffect, useState } from 'react';
import { GUILD_SELECTED_EVENT, SELECTED_GUILD_KEY } from '@/lib/guild-selection';

interface UseGuildSelectionOptions {
  onGuildChange?: () => void;
}

/**
 * Shared hook that listens for guild selection via localStorage and custom events.
 * Returns the currently selected guild ID.
 */
export function useGuildSelection(options?: UseGuildSelectionOptions): string | null {
  const [guildId, setGuildId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem(SELECTED_GUILD_KEY);
      if (saved) setGuildId(saved);
    } catch {
      // localStorage may be unavailable
    }

    const handleGuildSelect = (event: Event) => {
      const selected = (event as CustomEvent<string>).detail;
      if (selected) {
        setGuildId(selected);
        options?.onGuildChange?.();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SELECTED_GUILD_KEY || !event.newValue) return;
      setGuildId(event.newValue);
      options?.onGuildChange?.();
    };

    window.addEventListener(GUILD_SELECTED_EVENT, handleGuildSelect as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(GUILD_SELECTED_EVENT, handleGuildSelect as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return guildId;
}
