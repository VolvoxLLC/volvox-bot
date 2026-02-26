"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { BotConfig, DeepPartial } from "@/types/config";
import { SYSTEM_PROMPT_MAX_LENGTH } from "@/types/config";
import { ConfigDiff } from "./config-diff";
import { SystemPromptEditor } from "./system-prompt-editor";
import { DiscardChangesButton } from "./reset-defaults-button";

/** Config sections exposed by the API — all fields optional for partial API responses. */
type GuildConfig = DeepPartial<BotConfig>;

/** Shared input styling for text inputs and textareas in the config editor. */
const inputClasses =
  "w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Parse a number input value, enforcing optional min/max constraints. Returns undefined if invalid. */
function parseNumberInput(raw: string, min?: number, max?: number): number | undefined {
  if (raw === "") return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) return undefined;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
}

/**
 * Type guard that checks whether a value is a guild configuration object returned by the API.
 *
 * @returns `true` if the value is an object containing at least one known top-level section
 *   (`ai`, `welcome`, `spam`, `moderation`, `triage`, `starboard`, `permissions`, `memory`) and each present section is a plain object
 *   (not an array or null). Returns `false` otherwise.
 */
function isGuildConfig(data: unknown): data is GuildConfig {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  const knownSections = ["ai", "welcome", "spam", "moderation", "triage", "starboard", "permissions", "memory"] as const;
  const hasKnownSection = knownSections.some((key) => key in obj);
  if (!hasKnownSection) return false;
  for (const key of knownSections) {
    if (key in obj) {
      const val = obj[key];
      if (val !== undefined && (typeof val !== "object" || val === null || Array.isArray(val))) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Renders the configuration editor for a selected guild, allowing viewing and editing of AI, welcome, moderation, and triage settings.
 *
 * The component loads the guild's authoritative config from the API, keeps a mutable draft for user edits, computes and applies patch updates per top-level section, warns on unsaved changes, and provides keyboard and UI controls for saving or discarding edits.
 *
 * @returns The editor UI as JSX when a guild is selected and the draft config is available; `null` while no draft is present (or when rendering is handled by loading/error/no-selection states).
 */
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
    let stored = "";
    try {
      stored = localStorage.getItem(SELECTED_GUILD_KEY) ?? "";
    } catch {
      // localStorage may be unavailable in SSR or restricted environments
    }
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

  // ── Derived state ──────────────────────────────────────────────
  const hasChanges = useMemo(() => {
    if (!savedConfig || !draftConfig) return false;
    return !deepEqual(savedConfig, draftConfig);
  }, [savedConfig, draftConfig]);

  // Check for validation errors before allowing save.
  // Currently only validates system prompt length; extend with additional checks as needed.
  const hasValidationErrors = useMemo(() => {
    if (!draftConfig) return false;
    const promptLength = draftConfig.ai?.systemPrompt?.length ?? 0;
    return promptLength > SYSTEM_PROMPT_MAX_LENGTH;
  }, [draftConfig]);

  // ── Warn on unsaved changes before navigation ──────────────────
  useEffect(() => {
    if (!hasChanges) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasChanges]);

  // ── Save changes (batched: parallel PATCH per section) ─────────
  const saveChanges = useCallback(async () => {
    if (!guildId || !savedConfig || !draftConfig) return;

    if (hasValidationErrors) {
      toast.error("Cannot save", {
        description: "Fix validation errors before saving.",
      });
      return;
    }

    const patches = computePatches(savedConfig, draftConfig);
    if (patches.length === 0) {
      toast.info("No changes to save.");
      return;
    }

    // Group patches by top-level section for batched requests
    const bySection = new Map<string, Array<{ path: string; value: unknown }>>();
    for (const patch of patches) {
      const section = patch.path.split(".")[0];
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section)!.push(patch);
    }

    setSaving(true);

    // Shared AbortController for all section saves - aborts all in-flight requests on 401
    const saveAbortController = new AbortController();
    const { signal } = saveAbortController;

    const failedSections: string[] = [];

    async function sendSection(sectionPatches: Array<{ path: string; value: unknown }>) {
      for (const patch of sectionPatches) {
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/config`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
            cache: "no-store",
            signal,
          },
        );

        if (res.status === 401) {
          // Abort all other in-flight requests before redirecting
          saveAbortController.abort();
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
    }

    try {
      const results = await Promise.allSettled(
        Array.from(bySection.entries()).map(async ([section, sectionPatches]) => {
          try {
            await sendSection(sectionPatches);
          } catch (err) {
            failedSections.push(section);
            throw err;
          }
        }),
      );

      const hasFailures = results.some((r) => r.status === "rejected");

      if (hasFailures) {
        // Partial failure: merge only succeeded sections into savedConfig so
        // the user can retry failed sections without losing their unsaved edits.
        const succeededSections = Array.from(bySection.keys()).filter(
          (s) => !failedSections.includes(s),
        );
        if (succeededSections.length > 0) {
          const snapshot = draftConfig;
          setSavedConfig((prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            for (const section of succeededSections) {
              (updated as Record<string, unknown>)[section] =
                (snapshot as Record<string, unknown>)[section];
            }
            return updated;
          });
        }
        toast.error("Some sections failed to save", {
          description: `Failed: ${failedSections.join(", ")}`,
        });
      } else {
        toast.success("Config saved successfully!");
        // Full success: reload to get the authoritative version from the server
        await fetchConfig(guildId);
      }
    } catch (err) {
      const msg = (err as Error).message || "Failed to save config";
      toast.error("Failed to save config", { description: msg });
    } finally {
      setSaving(false);
    }
  }, [guildId, savedConfig, draftConfig, hasValidationErrors, fetchConfig]);

  // ── Keyboard shortcut: Ctrl/Cmd+S to save ──────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges && !saving && !hasValidationErrors) {
          saveChanges();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasChanges, saving, hasValidationErrors, saveChanges]);

  // ── Discard edits ──────────────────────────────────────────────
  const discardChanges = useCallback(() => {
    if (!savedConfig) return;
    setDraftConfig(structuredClone(savedConfig));
    toast.success("Changes discarded.");
  }, [savedConfig]);

  // ── Draft updaters ─────────────────────────────────────────────
  const updateSystemPrompt = useCallback((value: string) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, ai: { ...prev.ai, systemPrompt: value } } as GuildConfig;
    });
  }, []);

  const updateAiEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, ai: { ...prev.ai, enabled } } as GuildConfig;
    });
  }, []);

  const updateWelcomeEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, welcome: { ...prev.welcome, enabled } } as GuildConfig;
    });
  }, []);

  const updateWelcomeMessage = useCallback((message: string) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, welcome: { ...prev.welcome, message } } as GuildConfig;
    });
  }, []);

  const updateModerationEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, moderation: { ...prev.moderation, enabled } } as GuildConfig;
    });
  }, []);

  const updateModerationField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, moderation: { ...prev.moderation, [field]: value } } as GuildConfig;
    });
  }, []);

  const updateModerationDmNotification = useCallback((action: string, value: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        moderation: {
          ...prev.moderation,
          dmNotifications: { ...prev.moderation?.dmNotifications, [action]: value },
        },
      } as GuildConfig;
    });
  }, []);

  const updateModerationEscalation = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        moderation: {
          ...prev.moderation,
          escalation: { ...prev.moderation?.escalation, enabled },
        },
      } as GuildConfig;
    });
  }, []);

  const updateTriageEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, triage: { ...prev.triage, enabled } } as GuildConfig;
    });
  }, []);

  const updateTriageField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, triage: { ...prev.triage, [field]: value } } as GuildConfig;
    });
  }, []);

  const updateStarboardField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, starboard: { ...prev.starboard, [field]: value } } as GuildConfig;
    });
  }, []);

  const updateRateLimitField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        moderation: {
          ...prev.moderation,
          rateLimit: { ...prev.moderation?.rateLimit, [field]: value },
        },
      } as GuildConfig;
    });
  }, []);

  const updateLinkFilterField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        moderation: {
          ...prev.moderation,
          linkFilter: { ...prev.moderation?.linkFilter, [field]: value },
        },
      } as GuildConfig;
    });
  }, []);

  const updatePermissionsField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, permissions: { ...prev.permissions, [field]: value } } as GuildConfig;
    });
  }, []);

  const updateMemoryField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, memory: { ...prev.memory, [field]: value } } as GuildConfig;
    });
  }, []);

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
      <div className="flex items-center justify-center py-12" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading configuration...</span>
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
          <DiscardChangesButton
            onReset={discardChanges}
            disabled={saving || !hasChanges}
            sectionLabel="all unsaved changes"
          />
          <Button
            onClick={saveChanges}
            disabled={saving || !hasChanges || hasValidationErrors}
            aria-keyshortcuts="Control+S Meta+S"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      {hasChanges && (
        <div
          className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200"
          role="status"
        >
          You have unsaved changes.{" "}
          <kbd className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-xs">
            Ctrl+S
          </kbd>{" "}
          to save.
        </div>
      )}

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
            <ToggleSwitch
              checked={draftConfig.ai?.enabled ?? false}
              onChange={updateAiEnabled}
              disabled={saving}
              label="AI Chat"
            />
          </div>
        </CardHeader>
      </Card>

      {/* System Prompt */}
      <SystemPromptEditor
        value={draftConfig.ai?.systemPrompt ?? ""}
        onChange={updateSystemPrompt}
        disabled={saving}
        maxLength={SYSTEM_PROMPT_MAX_LENGTH}
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
            <ToggleSwitch
              checked={draftConfig.welcome?.enabled ?? false}
              onChange={updateWelcomeEnabled}
              disabled={saving}
              label="Welcome Messages"
            />
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
              className={inputClasses}
              placeholder="Welcome message template..."
              aria-describedby="welcome-message-hint"
            />
          </label>
          <p id="welcome-message-hint" className="mt-1 text-xs text-muted-foreground">
            Use {"{user}"} for the member mention and {"{memberCount}"} for the
            server member count.
          </p>
        </CardContent>
      </Card>

      {/* Moderation section */}
      {draftConfig.moderation && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Moderation</CardTitle>
                <CardDescription>
                  Configure moderation, escalation, and logging settings.
                </CardDescription>
              </div>
              <ToggleSwitch
                checked={draftConfig.moderation?.enabled ?? false}
                onChange={updateModerationEnabled}
                disabled={saving}
                label="Moderation"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Alert Channel ID</span>
              <input
                type="text"
                value={draftConfig.moderation?.alertChannelId ?? ""}
                onChange={(e) => updateModerationField("alertChannelId", e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="Channel ID for moderation alerts"
              />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Auto-delete flagged messages</span>
              <ToggleSwitch
                checked={draftConfig.moderation?.autoDelete ?? false}
                onChange={(v) => updateModerationField("autoDelete", v)}
                disabled={saving}
                label="Auto Delete"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">DM Notifications</legend>
              {(["warn", "timeout", "kick", "ban"] as const).map((action) => (
                <div key={action} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-muted-foreground">{action}</span>
                  <ToggleSwitch
                    checked={draftConfig.moderation?.dmNotifications?.[action] ?? false}
                    onChange={(v) => updateModerationDmNotification(action, v)}
                    disabled={saving}
                    label={`DM on ${action}`}
                  />
                </div>
              ))}
            </fieldset>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Escalation Enabled</span>
              <ToggleSwitch
                checked={draftConfig.moderation?.escalation?.enabled ?? false}
                onChange={(v) => updateModerationEscalation(v)}
                disabled={saving}
                label="Escalation"
              />
            </div>

            {/* Rate Limiting sub-section */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Rate Limiting</legend>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Enabled</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.rateLimit?.enabled ?? false}
                  onChange={(v) => updateRateLimitField("enabled", v)}
                  disabled={saving}
                  label="Rate Limiting"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Max Messages</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.maxMessages ?? 10}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 0);
                      if (num !== undefined) updateRateLimitField("maxMessages", num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Window (seconds)</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.windowSeconds ?? 10}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 0);
                      if (num !== undefined) updateRateLimitField("windowSeconds", num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Mute After Triggers</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteAfterTriggers ?? 3}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 0);
                      if (num !== undefined) updateRateLimitField("muteAfterTriggers", num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Mute Window (s)</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteWindowSeconds ?? 300}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 0);
                      if (num !== undefined) updateRateLimitField("muteWindowSeconds", num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-muted-foreground">Mute Duration (s)</span>
                  <input
                    type="number"
                    min={1}
                    value={draftConfig.moderation?.rateLimit?.muteDurationSeconds ?? 300}
                    onChange={(e) => {
                      const num = parseNumberInput(e.target.value, 0);
                      if (num !== undefined) updateRateLimitField("muteDurationSeconds", num);
                    }}
                    disabled={saving}
                    className={inputClasses}
                  />
                </label>
              </div>
            </fieldset>

            {/* Link Filtering sub-section */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Link Filtering</legend>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Enabled</span>
                <ToggleSwitch
                  checked={draftConfig.moderation?.linkFilter?.enabled ?? false}
                  onChange={(v) => updateLinkFilterField("enabled", v)}
                  disabled={saving}
                  label="Link Filtering"
                />
              </div>
              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">Blocked Domains</span>
                <input
                  type="text"
                  value={(draftConfig.moderation?.linkFilter?.blockedDomains ?? []).join(", ")}
                  onChange={(e) =>
                    updateLinkFilterField(
                      "blockedDomains",
                      e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    )
                  }
                  disabled={saving}
                  className={inputClasses}
                  placeholder="example.com, spam.net"
                />
              </label>
            </fieldset>
          </CardContent>
        </Card>
      )}

      {/* Triage section */}
      {draftConfig.triage && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Triage</CardTitle>
                <CardDescription>
                  Configure message triage classifier, responder models, and channels.
                </CardDescription>
              </div>
              <ToggleSwitch
                checked={draftConfig.triage?.enabled ?? false}
                onChange={updateTriageEnabled}
                disabled={saving}
                label="Triage"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Classify Model</span>
              <input
                type="text"
                value={draftConfig.triage?.classifyModel ?? ""}
                onChange={(e) => updateTriageField("classifyModel", e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="e.g. claude-haiku-4-5"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Respond Model</span>
              <input
                type="text"
                value={draftConfig.triage?.respondModel ?? ""}
                onChange={(e) => updateTriageField("respondModel", e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="e.g. claude-sonnet-4-6"
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Classify Budget</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={draftConfig.triage?.classifyBudget ?? 0}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 0);
                    if (num !== undefined) updateTriageField("classifyBudget", num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Respond Budget</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={draftConfig.triage?.respondBudget ?? 0}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 0);
                    if (num !== undefined) updateTriageField("respondBudget", num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Default Interval (ms)</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.triage?.defaultInterval ?? 3000}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 0);
                    if (num !== undefined) updateTriageField("defaultInterval", num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Timeout (ms)</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.triage?.timeout ?? 30000}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 0);
                    if (num !== undefined) updateTriageField("timeout", num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Context Messages</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.triage?.contextMessages ?? 10}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 0);
                    if (num !== undefined) updateTriageField("contextMessages", num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Max Buffer Size</span>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.triage?.maxBufferSize ?? 30}
                  onChange={(e) => {
                    const num = parseNumberInput(e.target.value, 0);
                    if (num !== undefined) updateTriageField("maxBufferSize", num);
                  }}
                  disabled={saving}
                  className={inputClasses}
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Streaming</span>
              <ToggleSwitch
                checked={draftConfig.triage?.streaming ?? false}
                onChange={(v) => updateTriageField("streaming", v)}
                disabled={saving}
                label="Streaming"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Moderation Response</span>
              <ToggleSwitch
                checked={draftConfig.triage?.moderationResponse ?? false}
                onChange={(v) => updateTriageField("moderationResponse", v)}
                disabled={saving}
                label="Moderation Response"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Debug Footer</span>
              <ToggleSwitch
                checked={draftConfig.triage?.debugFooter ?? false}
                onChange={(v) => updateTriageField("debugFooter", v)}
                disabled={saving}
                label="Debug Footer"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status Reactions</span>
              <ToggleSwitch
                checked={draftConfig.triage?.statusReactions ?? false}
                onChange={(v) => updateTriageField("statusReactions", v)}
                disabled={saving}
                label="Status Reactions"
              />
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium">Moderation Log Channel</span>
              <input
                type="text"
                value={draftConfig.triage?.moderationLogChannel ?? ""}
                onChange={(e) => updateTriageField("moderationLogChannel", e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="Channel ID for moderation logs"
              />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Starboard section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Starboard</CardTitle>
              <CardDescription>
                Pin popular messages to a starboard channel.
              </CardDescription>
            </div>
            <ToggleSwitch
              checked={draftConfig.starboard?.enabled ?? false}
              onChange={(v) => updateStarboardField("enabled", v)}
              disabled={saving}
              label="Starboard"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Channel ID</span>
            <input
              type="text"
              value={draftConfig.starboard?.channelId ?? ""}
              onChange={(e) => updateStarboardField("channelId", e.target.value)}
              disabled={saving}
              className={inputClasses}
              placeholder="Starboard channel ID"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Threshold</span>
              <input
                type="number"
                min={1}
                value={draftConfig.starboard?.threshold ?? 3}
                onChange={(e) => {
                  const num = parseNumberInput(e.target.value, 1);
                  if (num !== undefined) updateStarboardField("threshold", num);
                }}
                disabled={saving}
                className={inputClasses}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Emoji</span>
              <input
                type="text"
                value={draftConfig.starboard?.emoji ?? "⭐"}
                onChange={(e) => updateStarboardField("emoji", e.target.value)}
                disabled={saving}
                className={inputClasses}
                placeholder="⭐"
              />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Allow Self-Star</span>
            <ToggleSwitch
              checked={draftConfig.starboard?.selfStarAllowed ?? false}
              onChange={(v) => updateStarboardField("selfStarAllowed", v)}
              disabled={saving}
              label="Self-Star Allowed"
            />
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium">Ignored Channels</span>
            <input
              type="text"
              value={(draftConfig.starboard?.ignoredChannels ?? []).join(", ")}
              onChange={(e) =>
                updateStarboardField(
                  "ignoredChannels",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                )
              }
              disabled={saving}
              className={inputClasses}
              placeholder="Comma-separated channel IDs"
            />
          </label>
        </CardContent>
      </Card>

      {/* Permissions section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Permissions</CardTitle>
              <CardDescription>
                Configure role-based access and bot owner overrides.
              </CardDescription>
            </div>
            <ToggleSwitch
              checked={draftConfig.permissions?.enabled ?? false}
              onChange={(v) => updatePermissionsField("enabled", v)}
              disabled={saving}
              label="Permissions"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Admin Role ID</span>
            <input
              type="text"
              value={draftConfig.permissions?.adminRoleId ?? ""}
              onChange={(e) => updatePermissionsField("adminRoleId", e.target.value)}
              disabled={saving}
              className={inputClasses}
              placeholder="Discord role ID for admins"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Moderator Role ID</span>
            <input
              type="text"
              value={draftConfig.permissions?.moderatorRoleId ?? ""}
              onChange={(e) => updatePermissionsField("moderatorRoleId", e.target.value)}
              disabled={saving}
              className={inputClasses}
              placeholder="Discord role ID for moderators"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Bot Owners</span>
            <input
              type="text"
              value={(draftConfig.permissions?.botOwners ?? []).join(", ")}
              onChange={(e) =>
                updatePermissionsField(
                  "botOwners",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                )
              }
              disabled={saving}
              className={inputClasses}
              placeholder="Comma-separated user IDs"
            />
          </label>
        </CardContent>
      </Card>

      {/* Memory section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Memory</CardTitle>
              <CardDescription>
                Configure AI context memory and auto-extraction.
              </CardDescription>
            </div>
            <ToggleSwitch
              checked={draftConfig.memory?.enabled ?? false}
              onChange={(v) => updateMemoryField("enabled", v)}
              disabled={saving}
              label="Memory"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Max Context Memories</span>
            <input
              type="number"
              min={1}
              value={draftConfig.memory?.maxContextMemories ?? 10}
              onChange={(e) => {
                const num = parseNumberInput(e.target.value, 0);
                if (num !== undefined) updateMemoryField("maxContextMemories", num);
              }}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Auto-Extract</span>
            <ToggleSwitch
              checked={draftConfig.memory?.autoExtract ?? false}
              onChange={(v) => updateMemoryField("autoExtract", v)}
              disabled={saving}
              label="Auto-Extract"
            />
          </div>
        </CardContent>
      </Card>

      {/* Diff view */}
      {hasChanges && savedConfig && (
        <ConfigDiff original={savedConfig} modified={draftConfig} />
      )}
    </div>
  );
}

// ── Toggle Switch ───────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

/**
 * Renders an accessible toggle switch control.
 *
 * The switch reflects the `checked` state, calls `onChange` with the new boolean value when toggled,
 * and exposes an ARIA label derived from `label`.
 *
 * @param checked - Current on/off state of the switch.
 * @param onChange - Callback invoked with the new checked state when the switch is toggled.
 * @param disabled - When true, disables user interaction and applies disabled styling.
 * @param label - Human-readable name used for the switch's ARIA label.
 * @returns The button element acting as the toggle switch.
 */
function ToggleSwitch({ checked, onChange, disabled, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${label}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-primary aria-[checked=false]:bg-muted"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
        data-state={checked ? "checked" : "unchecked"}
      />
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Determine whether two JSON-serializable values are deeply equal by recursively comparing primitives, arrays, and plain objects.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns `true` if `a` and `b` are structurally equal, `false` otherwise
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.hasOwn(bObj, key) && deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Compute a flat list of dot-path patches that describe differences between two guild configs.
 *
 * Skips the root-level `guildId`, recurses into plain objects to emit leaf-level changes,
 * and produces a patch for any differing non-object value or array.
 *
 * @param original - The original (server-authoritative) guild configuration to compare against
 * @param modified - The modified guild configuration containing desired updates
 * @returns An array of patches where each item has a dot-separated `path` to the changed field and `value` set to the new value
 */
function computePatches(
  original: GuildConfig,
  modified: GuildConfig,
): Array<{ path: string; value: unknown }> {
  const patches: Array<{ path: string; value: unknown }> = [];

  /**
   * Traverse two plain-object trees and record leaf-level differences as path/value patches.
   *
   * Walks the structures rooted at `origObj` and `modObj`, compares values recursively, and appends
   * a patch { path, value } to the outer-scope `patches` array for each leaf or differing non-object
   * value in `modObj`. The root-level field named "guildId" is ignored.
   *
   * @param origObj - The original (source) object to compare against
   * @param modObj - The modified (target) object to derive patches from
   * @param prefix - Current dot-separated path prefix for nested keys (use empty string for root)
   */
  function walk(
    origObj: Record<string, unknown>,
    modObj: Record<string, unknown>,
    prefix: string,
  ) {
    const allKeys = new Set([...Object.keys(origObj), ...Object.keys(modObj)]);

    for (const key of allKeys) {
      // Skip the guildId metadata field
      if (prefix === "" && key === "guildId") continue;

      const fullPath = prefix ? `${prefix}.${key}` : key;
      const origVal = origObj[key];
      const modVal = modObj[key];

      if (deepEqual(origVal, modVal)) continue;

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
        patches.push({ path: fullPath, value: modVal });
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
