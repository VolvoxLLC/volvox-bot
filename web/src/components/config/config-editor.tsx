"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfigSectionPanel, SECTION_META } from "./config-section";
import { useConfigStore } from "@/stores/config-store";
import {
  GUILD_SELECTED_EVENT,
  SELECTED_GUILD_KEY,
} from "@/lib/guild-selection";
import type { BotConfig, ConfigSection } from "@/types/config";

/** Section ordering and icons for the accordion. */
const SECTIONS: Array<{ key: ConfigSection; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "ai", icon: Bot },
  { key: "welcome", icon: MessageSquare },
  { key: "spam", icon: Shield },
  { key: "moderation", icon: Zap },
  { key: "triage", icon: Sparkles },
];

function getSectionData(config: BotConfig, section: ConfigSection): Record<string, unknown> | null {
  const data = config[section as keyof BotConfig];
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

export function ConfigEditor() {
  const [guildId, setGuildId] = useState<string | null>(null);
  const { config, loading, saving, error, lastFetchedAt, fetchConfig, updateValue, reset } =
    useConfigStore();
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Listen for guild selection changes (same pattern as analytics-dashboard)
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedGuild = window.localStorage.getItem(SELECTED_GUILD_KEY);
      if (savedGuild) setGuildId(savedGuild);
    } catch {
      // localStorage may be unavailable
    }

    const handleGuildSelect = (event: Event) => {
      const selectedGuild = (event as CustomEvent<string>).detail;
      if (!selectedGuild) return;
      setGuildId(selectedGuild);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SELECTED_GUILD_KEY || !event.newValue) return;
      setGuildId(event.newValue);
    };

    window.addEventListener(GUILD_SELECTED_EVENT, handleGuildSelect as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(GUILD_SELECTED_EVENT, handleGuildSelect as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Fetch config when guild changes
  useEffect(() => {
    if (!guildId) {
      reset();
      return;
    }

    void fetchConfig(guildId);
  }, [guildId, fetchConfig, reset]);

  // Cleanup debounce timers
  useEffect(() => {
    return () => {
      for (const timer of debounceTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const handleUpdate = useCallback(
    (path: string, value: unknown) => {
      if (!guildId) return;

      // Clear existing debounce for this path
      const existing = debounceTimers.current.get(path);
      if (existing) clearTimeout(existing);

      // Debounce writes by 500ms to avoid spamming the API on rapid typing
      const timer = setTimeout(() => {
        debounceTimers.current.delete(path);
        void updateValue(guildId, path, value);
      }, 500);

      debounceTimers.current.set(path, timer);
    },
    [guildId, updateValue],
  );

  if (!guildId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select a server</CardTitle>
          <CardDescription>
            Choose a server from the sidebar to manage its configuration.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bot Configuration</h1>
          <p className="text-muted-foreground">
            View and edit your server&apos;s bot configuration.
          </p>
          {lastFetchedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last fetched{" "}
              {new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              }).format(lastFetchedAt)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => guildId && void fetchConfig(guildId)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50" role="alert">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => guildId && void fetchConfig(guildId)}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {loading && !config && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {config && (
        <Accordion type="multiple" defaultValue={["ai"]} className="space-y-2">
          {SECTIONS.map(({ key, icon: Icon }) => {
            const data = getSectionData(config, key);
            if (!data) return null;

            const meta = SECTION_META[key];

            return (
              <AccordionItem key={key} value={key} className="rounded-lg border px-4">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{meta.label}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ConfigSectionPanel
                    section={key}
                    data={data}
                    onUpdate={handleUpdate}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
