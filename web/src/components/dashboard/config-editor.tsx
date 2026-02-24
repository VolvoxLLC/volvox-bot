"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GUILD_SELECTED_EVENT,
  SELECTED_GUILD_KEY,
} from "@/lib/guild-selection";
import { ConfigDiff } from "./config-diff";
import { SystemPromptEditor } from "./system-prompt-editor";
import { ResetDefaultsButton } from "./reset-defaults-button";

/** Config sections exposed by the API. */
interface GuildConfig {
  guildId?: string;
  ai?: {
    enabled?: boolean;
    systemPrompt?: string;
    channels?: string[];
    historyLength?: number;
    historyTTLDays?: number;
    threadMode?: {
      enabled?: boolean;
      autoArchiveMinutes?: number;
      reuseWindowMinutes?: number;
    };
  };
  welcome?: {
    enabled?: boolean;
    channelId?: string;
    message?: string;
    dynamic?: {
      enabled?: boolean;
      timezone?: string;
      activityWindowMinutes?: number;
      milestoneInterval?: number;
      highlightChannels?: string[];
      excludeChannels?: string[];
    };
  };
  spam?: Record<string, unknown>;
  moderation?: Record<string, unknown>;
}

function isGuildConfig(data: unknown): data is GuildConfig {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

export function ConfigEditor() {
  const [guildId, setGuildId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The config as last fetched from the API (the "saved" state). */
  const [savedConfig, setSavedConfig] = useState<GuildConfig | null>(null);
  /** Working copy that the user edits. */
  const [draftConfig, setDraftConfig] = useState<GuildConfig | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ── Guild selection ────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(SELECTED_GUILD_KEY) ?? "";
    setGuildId(stored);

    function onGuildSelected(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setGuildId(detail);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === SELECTED_GUILD_KEY) {
        setGuildId(e.newValue ?? "");
      }
    }

    window.addEventListener(GUILD_SELECTED_EVENT, onGuildSelected);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GUILD_SELECTED_EVENT, onGuildSelected);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // ── Load config when guild changes ─────────────────────────────
  const fetchConfig = useCallback(
    async (id: string) => {
      if (!id) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/guilds/${encodeURIComponent(id)}/config`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }

        const data: unknown = await res.json();
        if (!isGuildConfig(data)) {
          throw new Error("Invalid config response");
        }

        setSavedConfig(data);
        setDraftConfig(structuredClone(data));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = (err as Error).message || "Failed to load config";
        setError(msg);
        toast.error("Failed to load config", { description: msg });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchConfig(guildId);
    return () => abortRef.current?.abort();
  }, [guildId, fetchConfig]);

  // ── Save changes (one field at a time via PATCH) ───────────────
  const saveChanges = useCallback(async () => {
    if (!guildId || !savedConfig || !draftConfig) return;

    const patches = computePatches(savedConfig, draftConfig);
    if (patches.length === 0) {
      toast.info("No changes to save.");
      return;
    }

    setSaving(true);

    try {
      for (const patch of patches) {
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/config`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
            cache: "no-store",
          },
        );

        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }
      }

      toast.success("Config saved successfully!");
      // Reload to get the authoritative version from the server
      await fetchConfig(guildId);
    } catch (err) {
      const msg = (err as Error).message || "Failed to save config";
      toast.error("Failed to save config", { description: msg });
    } finally {
      setSaving(false);
    }
  }, [guildId, savedConfig, draftConfig, fetchConfig]);

  // ── Reset to defaults ──────────────────────────────────────────
  const resetToDefaults = useCallback(() => {
    if (!savedConfig) return;
    // Revert the working copy back to the last-saved state
    setDraftConfig(structuredClone(savedConfig));
    toast.success("Config reset to saved values.");
  }, [savedConfig]);

  // ── Draft updaters ─────────────────────────────────────────────
  const updateSystemPrompt = useCallback((value: string) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, ai: { ...prev.ai, systemPrompt: value } };
    });
  }, []);

  const updateAiEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, ai: { ...prev.ai, enabled } };
    });
  }, []);

  const updateWelcomeEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, welcome: { ...prev.welcome, enabled } };
    });
  }, []);

  const updateWelcomeMessage = useCallback((message: string) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, welcome: { ...prev.welcome, message } };
    });
  }, []);

  // ── Derived state ──────────────────────────────────────────────
  const hasChanges =
    savedConfig &&
    draftConfig &&
    JSON.stringify(savedConfig) !== JSON.stringify(draftConfig);

  // ── No guild selected ──────────────────────────────────────────
  if (!guildId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bot Configuration</CardTitle>
          <CardDescription>
            Select a server from the sidebar to manage its configuration.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive/50" role="alert">
        <CardHeader>
          <CardTitle className="text-destructive">
            Failed to Load Config
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => fetchConfig(guildId)}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!draftConfig) return null;

  // ── Editor UI ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Bot Configuration
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage AI, welcome messages, and other settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ResetDefaultsButton
            onReset={resetToDefaults}
            disabled={saving || !hasChanges}
            sectionLabel="the configuration"
          />
          <Button
            onClick={saveChanges}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* AI section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">AI Chat</CardTitle>
              <CardDescription>
                Configure the AI assistant behavior.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draftConfig.ai?.enabled ?? false}
                onChange={(e) => updateAiEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-input"
                disabled={saving}
              />
              Enabled
            </label>
          </div>
        </CardHeader>
      </Card>

      {/* System Prompt */}
      <SystemPromptEditor
        value={draftConfig.ai?.systemPrompt ?? ""}
        onChange={updateSystemPrompt}
        disabled={saving}
      />

      {/* Welcome section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Welcome Messages</CardTitle>
              <CardDescription>
                Greet new members when they join the server.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draftConfig.welcome?.enabled ?? false}
                onChange={(e) => updateWelcomeEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-input"
                disabled={saving}
              />
              Enabled
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <label className="space-y-2">
            <span className="text-sm font-medium">Welcome Message</span>
            <textarea
              value={draftConfig.welcome?.message ?? ""}
              onChange={(e) => updateWelcomeMessage(e.target.value)}
              rows={4}
              disabled={saving}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Welcome message template..."
            />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Use {"{user}"} for the member mention and {"{memberCount}"} for the
            server member count.
          </p>
        </CardContent>
      </Card>

      {/* Moderation (read-only) */}
      {draftConfig.moderation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Moderation</CardTitle>
            <CardDescription>
              Moderation settings are read-only from the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-4 font-mono text-xs text-muted-foreground">
              {JSON.stringify(draftConfig.moderation, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Diff view */}
      {hasChanges && savedConfig && (
        <ConfigDiff original={savedConfig} modified={draftConfig} />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Compare two config objects and return an array of `{ path, value }` patches
 * suitable for the PATCH API endpoint.
 */
function computePatches(
  original: GuildConfig,
  modified: GuildConfig,
): Array<{ path: string; value: unknown }> {
  const patches: Array<{ path: string; value: unknown }> = [];

  function walk(
    origObj: Record<string, unknown>,
    modObj: Record<string, unknown>,
    prefix: string,
  ) {
    const allKeys = new Set([...Object.keys(origObj), ...Object.keys(modObj)]);

    for (const key of allKeys) {
      // Skip the guildId metadata field
      if (prefix === "" && key === "guildId") continue;
      // Skip read-only sections
      if (prefix === "" && key === "moderation") continue;

      const fullPath = prefix ? `${prefix}.${key}` : key;
      const origVal = origObj[key];
      const modVal = modObj[key];

      if (JSON.stringify(origVal) === JSON.stringify(modVal)) continue;

      // If both are plain objects, recurse to find the leaf changes
      if (
        typeof origVal === "object" &&
        origVal !== null &&
        !Array.isArray(origVal) &&
        typeof modVal === "object" &&
        modVal !== null &&
        !Array.isArray(modVal)
      ) {
        walk(
          origVal as Record<string, unknown>,
          modVal as Record<string, unknown>,
          fullPath,
        );
      } else {
        // Leaf change — the API requires at least one dot in the path
        if (fullPath.includes(".")) {
          patches.push({ path: fullPath, value: modVal });
        }
      }
    }
  }

  walk(
    original as unknown as Record<string, unknown>,
    modified as unknown as Record<string, unknown>,
    "",
  );

  return patches;
}
