import Link from "next/link";
import {
  Bot,
  MessageSquare,
  Shield,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: MessageSquare,
    title: "AI Chat",
    description:
      "Powered by Claude via OpenClaw — natural conversations, context-aware responses, and organic chat participation.",
  },
  {
    icon: Shield,
    title: "Moderation",
    description:
      "Comprehensive moderation toolkit — warns, kicks, bans, timeouts, tempbans with full case tracking and mod logs.",
  },
  {
    icon: Users,
    title: "Welcome Messages",
    description:
      "Dynamic, AI-generated welcome messages that make every new member feel special.",
  },
  {
    icon: Zap,
    title: "Spam Detection",
    description:
      "Automatic spam and scam detection to keep your community safe.",
  },
  {
    icon: Sparkles,
    title: "Runtime Config",
    description:
      "Configure everything on the fly — no restarts needed. Database-backed config with slash command management.",
  },
  {
    icon: Bot,
    title: "Web Dashboard",
    description:
      "This dashboard — manage your bot settings, view mod logs, and configure your server from any device.",
  },
];

export default function LandingPage() {
  const botInviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? ""}&permissions=8&scope=bot%20applications.commands`;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-discord text-white font-bold text-sm">
              B
            </div>
            <span className="font-bold text-lg">Bill Bot</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="discord" size="sm">
                Add to Server
              </Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container flex flex-col items-center justify-center gap-6 py-20 md:py-32 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-discord text-white font-bold text-3xl shadow-lg">
          B
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
          Bill Bot
        </h1>
        <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
          The AI-powered Discord bot for the Volvox community. Moderation, AI
          chat, dynamic welcomes, spam detection, and a fully configurable web
          dashboard.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="discord" size="lg" className="gap-2">
              <Bot className="h-5 w-5" />
              Add to Server
            </Button>
          </a>
          <Link href="/login">
            <Button variant="outline" size="lg">
              Open Dashboard
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            A full-featured Discord bot with a modern web dashboard.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="transition-colors hover:border-discord/50">
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-discord/10 text-discord">
                  <feature.icon className="h-5 w-5" />
                </div>
                <CardTitle className="mt-4">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/50">
        <div className="container flex flex-col items-center gap-6 py-16 md:py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to get started?
          </h2>
          <p className="max-w-[32rem] text-muted-foreground">
            Add Bill Bot to your Discord server and manage everything from this
            dashboard.
          </p>
          <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="discord" size="lg" className="gap-2">
              <Bot className="h-5 w-5" />
              Add to Server
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Bill Bot. Built for the Volvox
            community.
          </p>
          <nav className="flex gap-4">
            <a
              href="https://github.com/BillChirico/bills-bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://discord.gg/volvox"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Discord
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
