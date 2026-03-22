const recentActions = [
  { icon: '🛡️', label: 'Spam detected & removed', channel: '#general', time: '1m ago' },
  { icon: '⚠️', label: 'User warned for toxicity', channel: '#off-topic', time: '8m ago' },
  { icon: '🚫', label: 'Raid prevented — 12 accounts blocked', channel: 'Server', time: '23m ago' },
  { icon: '🔇', label: 'User muted for repeated violations', channel: '#gaming', time: '45m ago' },
];

const toggles = [
  { label: 'Anti-Spam', enabled: true },
  { label: 'Raid Protection', enabled: true },
  { label: 'Toxicity Filter', enabled: true },
  { label: 'Link Scanning', enabled: false },
];

/**
 * Moderation tab content for the DashboardPreview section.
 * Shows threat stats, recent actions, and decorative toggle switches.
 */
export function DashboardModerationTab() {
  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="text-xl font-bold text-foreground">47</div>
          <div className="text-xs text-muted-foreground">Threats Blocked Today</div>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="text-xl font-bold text-foreground">99.2%</div>
          <div className="text-xs text-muted-foreground">Detection Accuracy</div>
        </div>
      </div>

      {/* Recent actions */}
      <div className="rounded-lg border border-border bg-background/50 p-4">
        <div className="text-sm font-medium text-foreground mb-3">Recent Actions</div>
        <div className="space-y-3">
          {recentActions.map((action) => (
            <div key={action.label} className="flex items-start gap-2 text-xs">
              <span>{action.icon}</span>
              <div className="flex-1">
                <div className="text-foreground">{action.label}</div>
                <div className="text-muted-foreground">{action.channel}</div>
              </div>
              <span className="text-muted-foreground">{action.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Toggle switches (decorative) */}
      <div className="grid grid-cols-2 gap-2">
        {toggles.map((toggle) => (
          <div
            key={toggle.label}
            className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2"
          >
            <span className="text-xs text-foreground">{toggle.label}</span>
            <div
              className={`h-4 w-7 rounded-full ${toggle.enabled ? 'bg-primary' : 'bg-muted'} relative`}
            >
              <div
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${toggle.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
