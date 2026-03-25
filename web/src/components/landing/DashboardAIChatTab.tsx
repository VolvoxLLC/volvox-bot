const conversation = [
  { id: 'msg-1', sender: 'user', name: 'Alex', text: 'Hey @volvox, how do I set up webhooks?' },
  {
    id: 'msg-2',
    sender: 'bot',
    name: 'Volvox',
    text: 'Go to Server Settings > Integrations > Webhooks. Click "New Webhook", name it, pick a channel, and copy the URL.',
  },
  { id: 'msg-3', sender: 'user', name: 'Alex', text: 'Thanks! Can I use it with GitHub?' },
];

/**
 * AI Chat tab content for the DashboardPreview section.
 * Shows chat stats, a sample conversation, and a token usage meter.
 */
export function DashboardAIChatTab() {
  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="text-xl font-bold text-foreground">156</div>
          <div className="text-xs text-muted-foreground">Conversations</div>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="text-xl font-bold text-foreground">1.2s</div>
          <div className="text-xs text-muted-foreground">Avg Response Time</div>
        </div>
      </div>

      {/* Conversation snippet */}
      <div className="rounded-lg border border-border bg-background/50 p-4">
        <div className="text-sm font-medium text-foreground mb-3">Sample Conversation</div>
        <div className="space-y-3">
          {conversation.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${
                  msg.sender === 'bot' ? 'bg-primary' : 'bg-secondary'
                }`}
              >
                {msg.name[0]}
              </div>
              <div>
                <span className="text-xs font-medium text-foreground">{msg.name}</span>
                <p className="text-xs text-muted-foreground leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Token usage meter */}
      <div className="rounded-lg border border-border bg-background/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">Token Usage</span>
          <span className="text-xs text-muted-foreground">67%</span>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary" style={{ width: '67%' }} />
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          670k / 1M tokens used this month
        </div>
      </div>
    </div>
  );
}
