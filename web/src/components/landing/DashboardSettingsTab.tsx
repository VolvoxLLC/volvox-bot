const featureToggles = [
  { label: 'AI Chat', enabled: true },
  { label: 'Starboard', enabled: true },
  { label: 'Welcome Messages', enabled: false },
];

const channels = ['#general', '#support', '#off-topic', '#announcements'];

const roleMatrix = [
  { role: 'Admin', ai: true, mod: true, star: true },
  { role: 'Moderator', ai: true, mod: true, star: false },
  { role: 'Member', ai: true, mod: false, star: false },
];

/**
 * Settings tab content for the DashboardPreview section.
 * Shows feature toggles, a channel selector preview, and a role permission matrix.
 */
export function DashboardSettingsTab() {
  return (
    <div className="space-y-5">
      {/* Feature toggle cards */}
      <div className="grid grid-cols-3 gap-3">
        {featureToggles.map((feature) => (
          <div
            key={feature.label}
            className="rounded-lg border border-border bg-background/50 p-3 flex flex-col items-center gap-2"
          >
            <span className="text-xs font-medium text-foreground">{feature.label}</span>
            <div
              className={`h-4 w-7 rounded-full ${feature.enabled ? 'bg-primary' : 'bg-muted'} relative`}
            >
              <div
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${feature.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`}
              />
            </div>
            <span
              className={`text-[10px] ${feature.enabled ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {feature.enabled ? 'ON' : 'OFF'}
            </span>
          </div>
        ))}
      </div>

      {/* Channel selector preview */}
      <div className="rounded-lg border border-border bg-background/50 p-4">
        <div className="text-sm font-medium text-foreground mb-2">Default Channel</div>
        <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">
          #general
          <span className="float-right text-muted-foreground">▼</span>
        </div>
        <div className="mt-2 rounded-md border border-border bg-background divide-y divide-border">
          {channels.map((ch) => (
            <div key={ch} className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50">
              {ch}
            </div>
          ))}
        </div>
      </div>

      {/* Role permission matrix */}
      <div className="rounded-lg border border-border bg-background/50 p-4">
        <div className="text-sm font-medium text-foreground mb-3">Permissions</div>
        <div className="grid grid-cols-4 gap-1 text-[10px]">
          <div className="text-muted-foreground font-medium">Role</div>
          <div className="text-muted-foreground font-medium text-center">AI</div>
          <div className="text-muted-foreground font-medium text-center">Mod</div>
          <div className="text-muted-foreground font-medium text-center">Star</div>
          {roleMatrix.map((row) => (
            <div key={row.role} className="contents">
              <div className="text-foreground py-1">{row.role}</div>
              <div className="text-center py-1">{row.ai ? '✓' : '—'}</div>
              <div className="text-center py-1">{row.mod ? '✓' : '—'}</div>
              <div className="text-center py-1">{row.star ? '✓' : '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
