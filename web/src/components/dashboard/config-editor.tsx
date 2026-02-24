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
  moderation?: {
    enabled?: boolean;
    alertChannelId?: string;
    autoDelete?: boolean;
    dmNotifications?: {
      warn?: boolean;
      timeout?: boolean;
      kick?: boolean;
      ban?: boolean;
    };
    escalation?: {
      enabled?: boolean;
      thresholds?: Array<{
        warns?: number;
        withinDays?: number;
        action?: string;
        duration?: string;
      }>;
    };
    logging?: {
      channels?: {
        default?: string | null;
        warns?: string | null;
        bans?: string | null;
        kicks?: string | null;
        timeouts?: string | null;
        purges?: string | null;
        locks?: string | null;
      };
    };
  };
  triage?: {
    enabled?: boolean;
    defaultInterval?: number;
    maxBufferSize?: number;
    triggerWords?: string[];
    moderationKeywords?: string[];
    classifyModel?: string;
    classifyBudget?: number;
    respondModel?: string;
    respondBudget?: number;
    thinkingTokens?: number;
    classifyBaseUrl?: string | null;
    classifyApiKey?: string | null;
    respondBaseUrl?: string | null;
    respondApiKey?: string | null;
    streaming?: boolean;
    tokenRecycleLimit?: number;
    contextMessages?: number;
    timeout?: number;
    moderationResponse?: boolean;
    channels?: string[];
    excludeChannels?: string[];
    debugFooter?: boolean;
    debugFooterLevel?: string;
    moderationLogChannel?: string;
  };
}

function isGuildConfig(data: unknown): data is GuildConfig {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

/** Discord message character limit for system prompts. */
const SYSTEM_PROMPT_MAX_LENGTH = 4000;

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

  // ── Derived state (memoized to avoid repeated JSON.stringify) ──
  const hasChanges = useMemo(() => {
    if (!savedConfig || !draftConfig) return false;
    return JSON.stringify(savedConfig) !== JSON.stringify(draftConfig);
  }, [savedConfig, draftConfig]);

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
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasChanges]);

  // ── Save changes (one field at a time via PATCH) ───────────────
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

  const updateModerationEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, moderation: { ...prev.moderation, enabled } };
    });
  }, []);

  const updateModerationField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, moderation: { ...prev.moderation, [field]: value } };
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
      };
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
      };
    });
  }, []);

  const updateTriageEnabled = useCallback((enabled: boolean) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, triage: { ...prev.triage, enabled } };
    });
  }, []);

  const updateTriageField = useCallback((field: string, value: unknown) => {
    setDraftConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, triage: { ...prev.triage, [field]: value } };
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
          <ResetDefaultsButton
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
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="e.g. claude-sonnet-4-6"
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Classify Budget</span>
                <input
                  type="number"
                  step="0.01"
                  value={draftConfig.triage?.classifyBudget ?? 0}
                  onChange={(e) => updateTriageField("classifyBudget", Number(e.target.value))}
                  disabled={saving}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Respond Budget</span>
                <input
                  type="number"
                  step="0.01"
                  value={draftConfig.triage?.respondBudget ?? 0}
                  onChange={(e) => updateTriageField("respondBudget", Number(e.target.value))}
                  disabled={saving}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Default Interval (ms)</span>
                <input
                  type="number"
                  value={draftConfig.triage?.defaultInterval ?? 3000}
                  onChange={(e) => updateTriageField("defaultInterval", Number(e.target.value))}
                  disabled={saving}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Timeout (ms)</span>
                <input
                  type="number"
                  value={draftConfig.triage?.timeout ?? 30000}
                  onChange={(e) => updateTriageField("timeout", Number(e.target.value))}
                  disabled={saving}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Context Messages</span>
                <input
                  type="number"
                  value={draftConfig.triage?.contextMessages ?? 10}
                  onChange={(e) => updateTriageField("contextMessages", Number(e.target.value))}
                  disabled={saving}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Max Buffer Size</span>
                <input
                  type="number"
                  value={draftConfig.triage?.maxBufferSize ?? 30}
                  onChange={(e) => updateTriageField("maxBufferSize", Number(e.target.value))}
                  disabled={saving}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            <label className="space-y-2">
              <span className="text-sm font-medium">Moderation Log Channel</span>
              <input
                type="text"
                value={draftConfig.triage?.moderationLogChannel ?? ""}
                onChange={(e) => updateTriageField("moderationLogChannel", e.target.value)}
                disabled={saving}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Channel ID for moderation logs"
              />
            </label>
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

// ── Toggle Switch ───────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

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
