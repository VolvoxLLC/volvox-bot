import type { Metadata } from 'next';
import { Users, MessageSquare, Rocket, Trophy, ExternalLink, ThumbsUp, Github } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardMember {
  username: string;
  displayName: string;
  avatar: string | null;
  xp: number;
  level: number;
  badge: string;
  rank: number;
}

interface ShowcaseProject {
  id: number;
  title: string;
  description: string;
  tech: string[];
  repoUrl: string | null;
  liveUrl: string | null;
  authorName: string;
  authorAvatar: string | null;
  upvotes: number;
  createdAt: string;
}

interface CommunityStats {
  memberCount: number;
  messagesThisWeek: number;
  activeProjects: number;
  challengesCompleted: number;
  topContributors: {
    username: string;
    avatar: string | null;
    xp: number;
    level: number;
    badge: string;
  }[];
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

const API_BASE = process.env.BOT_API_URL || 'http://localhost:3001';

function getApiBase(): string {
  const trimmed = API_BASE.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

async function fetchStats(guildId: string): Promise<CommunityStats | null> {
  try {
    const res = await fetch(`${getApiBase()}/community/${guildId}/stats`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchLeaderboard(guildId: string): Promise<{ members: LeaderboardMember[]; total: number } | null> {
  try {
    const res = await fetch(`${getApiBase()}/community/${guildId}/leaderboard?limit=25&page=1`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchShowcases(guildId: string): Promise<{ projects: ShowcaseProject[]; total: number } | null> {
  try {
    const res = await fetch(`${getApiBase()}/community/${guildId}/showcases?limit=12&page=1&sort=upvotes`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── SEO ──────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ guildId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { guildId } = await params;
  const stats = await fetchStats(guildId);

  const title = 'Community Hub — Leaderboard & Showcases';
  const description = stats
    ? `Join ${stats.memberCount} public members. ${stats.activeProjects} projects showcased, ${stats.challengesCompleted} challenges completed.`
    : 'Explore our community leaderboard, project showcases, and stats.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <Card className="text-center">
      <CardContent className="pt-6">
        <Icon className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function XpBar({ xp, level }: { xp: number; level: number }) {
  // Simple thresholds matching the bot defaults
  const thresholds = [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000];
  const currentThreshold = thresholds[level - 1] || 0;
  const nextThreshold = thresholds[level] || thresholds[thresholds.length - 1];
  const progress = nextThreshold > currentThreshold
    ? Math.min(100, ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
    : 100;

  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div
        className="bg-primary h-2 rounded-full transition-all"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function MemberAvatar({ avatar, name, size = 'md' }: { avatar: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' };
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-primary/10 flex items-center justify-center`}>
      <span className={`${textSizes[size]} font-medium text-primary`}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm text-muted-foreground font-mono w-6 text-center">#{rank}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CommunityPage({ params }: PageProps) {
  const { guildId } = await params;

  const [stats, leaderboard, showcases] = await Promise.all([
    fetchStats(guildId),
    fetchLeaderboard(guildId),
    fetchShowcases(guildId),
  ]);

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Community Hub</h1>
          <p className="text-muted-foreground text-lg">
            Leaderboards, showcases, and community stats
          </p>
        </div>

        {/* Stats Banner */}
        {stats && (
          <section className="mb-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Public Members" value={stats.memberCount} />
              <StatCard icon={MessageSquare} label="Messages This Week" value={stats.messagesThisWeek.toLocaleString()} />
              <StatCard icon={Rocket} label="Projects" value={stats.activeProjects} />
              <StatCard icon={Trophy} label="Challenges Completed" value={stats.challengesCompleted} />
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Leaderboard */}
          <section className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Leaderboard
                </CardTitle>
                <CardDescription>Top members by XP</CardDescription>
              </CardHeader>
              <CardContent>
                {leaderboard && leaderboard.members.length > 0 ? (
                  <div className="space-y-3">
                    {leaderboard.members.map((member) => (
                      <Link
                        key={member.rank}
                        href={`/community/${guildId}/${member.username}`}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <RankBadge rank={member.rank} />
                        <MemberAvatar avatar={member.avatar} name={member.displayName} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{member.displayName}</span>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {member.badge}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <XpBar xp={member.xp} level={member.level} />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {member.xp.toLocaleString()} XP
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No public members yet. Use <code>/profile public</code> to opt in!
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Top Contributors Sidebar */}
          {stats && stats.topContributors.length > 0 && (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">🏅 Top Contributors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats.topContributors.map((contributor, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <MemberAvatar avatar={contributor.avatar} name={contributor.username} size="lg" />
                        <div>
                          <p className="font-medium">{contributor.username}</p>
                          <p className="text-xs text-muted-foreground">
                            {contributor.badge} · {contributor.xp.toLocaleString()} XP
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        {/* Showcase Gallery */}
        {showcases && showcases.projects.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Rocket className="h-6 w-6" />
              Project Showcase
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {showcases.projects.map((project) => (
                <Card key={project.id} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-lg">{project.title}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between gap-4">
                    <div className="flex flex-wrap gap-1.5">
                      {project.tech.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MemberAvatar avatar={project.authorAvatar} name={project.authorName} size="sm" />
                        <span className="text-sm text-muted-foreground">{project.authorName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <ThumbsUp className="h-3.5 w-3.5" />
                          {project.upvotes}
                        </span>
                        {project.repoUrl && (
                          <a
                            href={project.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="View repository"
                          >
                            <Github className="h-4 w-4" />
                          </a>
                        )}
                        {project.liveUrl && (
                          <a
                            href={project.liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="View live demo"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Privacy Notice */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            Only members who opted in with <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/profile public</code> appear here.
          </p>
          <p className="mt-1">Your profile is private by default.</p>
        </div>
      </div>
    </main>
  );
}
