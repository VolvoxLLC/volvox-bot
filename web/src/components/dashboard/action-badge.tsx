import { ACTION_META } from "./moderation-types";
import type { ModAction } from "./moderation-types";

interface ActionBadgeProps {
  action: ModAction;
  size?: "sm" | "md";
}

export function ActionBadge({ action, size = "sm" }: ActionBadgeProps) {
  const meta = ACTION_META[action];
  const sizeClasses = size === "sm"
    ? "px-2 py-0.5 text-xs font-medium"
    : "px-2.5 py-0.5 text-xs font-semibold";

  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizeClasses} ${
        meta?.badge ?? "bg-muted text-muted-foreground"
      }`}
    >
      {meta?.label ?? action}
    </span>
  );
}
