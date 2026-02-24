"use client";

import { Lock } from "lucide-react";
import { ConfigField } from "./config-field";
import type { ConfigSection } from "@/types/config";

/** Labels and descriptions for each config section. */
const SECTION_META: Record<ConfigSection, { label: string; description: string }> = {
  ai: {
    label: "AI Chat",
    description: "AI chat settings, system prompt, channels, and thread mode.",
  },
  welcome: {
    label: "Welcome Messages",
    description: "Welcome message template and dynamic generation settings.",
  },
  spam: {
    label: "Spam Detection",
    description: "Spam and scam pattern detection configuration.",
  },
  moderation: {
    label: "Moderation",
    description: "Moderation settings, escalation, and logging.",
  },
  triage: {
    label: "Triage",
    description: "Message triage classifier and responder models, budgets, and channels.",
  },
};

const READ_ONLY_SECTIONS = new Set<string>([]);

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

interface ConfigSectionPanelProps {
  section: ConfigSection;
  data: Record<string, unknown>;
  onUpdate: (path: string, value: unknown) => void;
}

export function ConfigSectionPanel({ section, data, onUpdate }: ConfigSectionPanelProps) {
  const meta = SECTION_META[section];
  const readOnly = READ_ONLY_SECTIONS.has(section);

  const entries = Object.entries(data);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">{meta.description}</p>
        {readOnly && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Read-only
          </span>
        )}
      </div>
      <div className="space-y-4">
        {entries.map(([key, value]) => (
          <ConfigField
            key={key}
            label={formatLabel(key)}
            path={`${section}.${key}`}
            value={value}
            readOnly={readOnly}
            onUpdate={onUpdate}
          />
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No configuration available for this section.</p>
        )}
      </div>
    </div>
  );
}

export { SECTION_META, READ_ONLY_SECTIONS };
