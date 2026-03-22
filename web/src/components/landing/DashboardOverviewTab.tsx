const kpis = [
  { label: 'Members', value: '1,247', change: '+12%', accent: 'bg-primary' },
  { label: 'Messages Today', value: '3,891', change: '+8%', accent: 'bg-secondary' },
  { label: 'AI Responses', value: '156', change: '+23%', accent: 'bg-accent' },
];

const barHeights = [40, 65, 55, 80, 70, 90, 75];
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const activityItems = [
  { dot: 'bg-primary', text: 'AI responded to #general chat', time: '2m ago' },
  { dot: 'bg-secondary', text: 'Auto-mod blocked spam in #links', time: '5m ago' },
  { dot: 'bg-accent', text: 'Welcome message sent to new member', time: '12m ago' },
  { dot: 'bg-primary', text: 'AI answered FAQ in #support', time: '18m ago' },
];

/**
 * Overview tab content for the DashboardPreview section.
 * Displays KPI cards, a weekly activity bar chart, and a recent activity feed.
 */
export function DashboardOverviewTab() {
  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-border bg-background/50 p-3">
            <div className={`h-1 w-8 rounded-full ${kpi.accent} mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
            <div className="text-xs text-primary mt-1">{kpi.change}</div>
          </div>
        ))}
      </div>

      {/* Server Activity chart */}
      <div className="rounded-lg border border-border bg-background/50 p-4">
        <div className="text-sm font-medium text-foreground mb-3">Server Activity</div>
        <div className="flex items-end gap-2 h-20">
          {barHeights.map((h, i) => (
            <div key={weekdays[i]} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-sm bg-primary/60"
                style={{ height: `${h}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{weekdays[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity feed */}
      <div className="space-y-2">
        {activityItems.map((item) => (
          <div key={item.text} className="flex items-center gap-2 text-xs">
            <div className={`h-2 w-2 rounded-full ${item.dot}`} />
            <span className="text-foreground flex-1">{item.text}</span>
            <span className="text-muted-foreground">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
