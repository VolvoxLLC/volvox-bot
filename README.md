# Bill Bot (Volvox Discord Bot)

AI-powered Discord bot for the Volvox community.

## Features

- **AI Chat** - Powered by Claude (via OpenClaw), responds when mentioned
- **Welcome Messages** - Dynamic, contextual onboarding (time of day, activity pulse, milestones)
- **Moderation** - Detects spam/scam patterns and alerts mods

## Requirements

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- OpenClaw gateway running (for AI chat)

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN` - Your Discord bot token
   - `OPENCLAW_URL` - OpenClaw chat completions endpoint
   - `OPENCLAW_TOKEN` - Your OpenClaw gateway token

2. Edit `config.json` for your server:
   - Channel IDs for welcome messages and mod alerts
   - AI system prompt and model settings
   - Enable/disable features

3. Install and run:
   ```bash
   pnpm install
   pnpm start
   ```

   For development (auto-restart on changes):
   ```bash
   pnpm dev
   ```

## Discord Bot Setup

1. Create app at https://discord.com/developers/applications
2. Bot → Add Bot → Copy token
3. Enable intents:
   - Message Content Intent ✅
   - Server Members Intent ✅
4. OAuth2 → URL Generator:
   - Scopes: `bot`
   - Permissions: View Channels, Send Messages, Read History, Manage Messages
5. Invite bot to server with generated URL

## Config

```jsonc
{
  "ai": {
    "enabled": true,
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 1024,
    "systemPrompt": "...",
    "channels": []  // empty = all channels, or list specific channel IDs
  },
  "welcome": {
    "enabled": true,
    "channelId": "...",
    "message": "Welcome, {user}!", // used when dynamic.enabled=false
    "dynamic": {
      "enabled": true,
      "timezone": "America/New_York",
      "activityWindowMinutes": 45,
      "milestoneInterval": 25,
      "highlightChannels": ["..."]
    }
  },
  "moderation": {
    "enabled": true,
    "alertChannelId": "...",
    "autoDelete": false
  }
}
```

## Architecture

```
Discord Message
     ↓
  bill-bot
     ↓
OpenClaw API (/v1/chat/completions)
     ↓
Claude (via your subscription)
     ↓
  Response
```

The bot routes AI requests through OpenClaw's chat completions endpoint, which uses your existing Claude subscription. No separate Anthropic API key needed.

## License

MIT
