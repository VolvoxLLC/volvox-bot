import { create } from "zustand";
import type { BotConfig, WritableConfigSection } from "@/types/config";

interface ConfigState {
  /** The loaded config, or null if not yet fetched. */
  config: BotConfig | null;
  /** Whether a fetch is in progress. */
  loading: boolean;
  /** Whether a patch is in progress. */
  saving: boolean;
  /** Error message from the last fetch or patch, if any. */
  error: string | null;
  /** Timestamp of the last successful fetch. */
  lastFetchedAt: Date | null;

  /** Fetch config for a guild from the proxy API. */
  fetchConfig: (guildId: string) => Promise<void>;

  /**
   * Update a single config value via the proxy API.
   * @param guildId - The guild to update config for.
   * @param path - Dot-notation path (e.g. "ai.enabled").
   * @param value - The new value.
   */
  updateValue: (guildId: string, path: string, value: unknown) => Promise<void>;

  /** Clear the store (e.g. on guild change). */
  reset: () => void;
}

function isErrorWithMessage(err: unknown): err is { error: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "error" in err &&
    typeof (err as { error: unknown }).error === "string"
  );
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  saving: false,
  error: null,
  lastFetchedAt: null,

  fetchConfig: async (guildId: string) => {
    set({ loading: true, error: null });

    try {
      const response = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/config`,
        { cache: "no-store" },
      );

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data: unknown = await response.json();

      if (!response.ok) {
        const message = isErrorWithMessage(data) ? data.error : "Failed to fetch config";
        set({ error: message, loading: false });
        return;
      }

      set({
        config: data as BotConfig,
        loading: false,
        lastFetchedAt: new Date(),
      });
    } catch {
      set({ error: "Failed to fetch config", loading: false });
    }
  },

  updateValue: async (guildId: string, path: string, value: unknown) => {
    const topLevelKey = path.split(".")[0] as WritableConfigSection;
    const writableKeys: WritableConfigSection[] = ["ai", "welcome", "spam"];
    if (!writableKeys.includes(topLevelKey)) {
      set({ error: `Section "${topLevelKey}" is read-only` });
      return;
    }

    set({ saving: true, error: null });

    try {
      const response = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/config`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, value }),
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data: unknown = await response.json();

      if (!response.ok) {
        const message = isErrorWithMessage(data) ? data.error : "Failed to update config";
        set({ error: message, saving: false });
        return;
      }

      // The PATCH response returns the updated section. Merge it into state.
      const current = get().config;
      if (current) {
        set({
          config: { ...current, [topLevelKey]: data },
          saving: false,
        });
      } else {
        set({ saving: false });
      }
    } catch {
      set({ error: "Failed to update config", saving: false });
    }
  },

  reset: () => {
    set({ config: null, loading: false, saving: false, error: null, lastFetchedAt: null });
  },
}));
