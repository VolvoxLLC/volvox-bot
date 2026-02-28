import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Github,
  Heart,
  MessageSquare,
  ThumbsUp,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  username: string;
  displayName: string;
  avatar: string | null;
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  badge: string;
  joinedAt: string | null;
  stats: {
    messagesSent: number;
    reactionsGiven: number;
    reactionsReceived: number;
    daysActive: number;
  };
  projects: {
    id: number;
    title: string;
    description: string;
    tech: string[];
    repoUrl: string | null;
    liveUrl: string | null;
    upvotes: number;
    createdAt: string;
  }[];
  recentBadges: {
    name: string;
    description: string;
  }[];
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

const API_BASE = process.env.BOT_API_URL || 'http://localhost:3001';

/**
 * Normalize the API base URL to ensure it ends with `/api/v1`.
 *
 * This removes any trailing slashes from the configured base and appends `/api/v1`
 * if it is not already present.
 *
 * @returns The API base URL guaranteed to end with `/api/v1`.
 */
function getApiBase(): string {
  const trimmed = API_BASE.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

/**
 * Fetches a community member's profile from the API.
 *
 * @param guildId - The guild (community) identifier
 * @param userId - The user's identifier
 * @returns The user's profile object if the request succeeds, `null` if the response is not OK or a network/error occurs
 */
async function fetchProfile(guildId: string, userId: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${getApiBase()}/community/${guildId}/profile/${userId}`, {
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
  params: Promise<{ guildId: string; userId: string }>;
}

/**
 * Builds metadata for a community member's profile page.
 *
 * Fetches the user's profile using route params and constructs page metadata including title,
 * description, Open Graph data, and Twitter card information. If the profile cannot be found,
 * returns metadata with the title "Profile Not Found".
 *
 * @param params - A promise that resolves to route parameters containing `guildId` and `userId`.
 * @returns The page metadata object used by Next.js (title, description, openGraph, twitter).
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { guildId, userId } = await params;
  const profile = await fetchProfile(guildId, userId);

  if (!profile) {
    return { title: 'Profile Not Found' };
  }

  const title = `${profile.displayName} — Community Profile`;
  const description = `Level ${profile.level} ${profile.badge} · ${profile.xp.toLocaleString()} XP · ${profile.stats.messagesSent.toLocaleString()} messages · ${profile.projects.length} projects`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      ...(profile.avatar && { images: [{ url: profile.avatar, width: 128, height: 128 }] }),
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

/**
 * Renders a compact statistic card with a leading icon, a prominent value, and a descriptive label.
 *
 * @param icon - Component used as the leading icon
 * @param label - Descriptive label shown below the value
 * @param value - Primary statistic displayed prominently
 * @returns A card element containing the icon, value, and label
 */

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Render an XP progress bar showing current XP and the next-level threshold.
 *
 * @param xp - The user's total experience points.
 * @param level - The user's current level (1-based).
 * @returns A React element displaying the XP range and a progress bar filled to the percentage toward the next threshold.
 */
function XpBar({
  xp,
  currentLevelXp,
  nextLevelXp,
}: {
  xp: number;
  currentLevelXp: number;
  nextLevelXp: number;
}) {
  const progress =
    nextLevelXp > currentLevelXp
      ? Math.min(100, ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100)
      : 100;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{xp.toLocaleString()} XP</span>
        <span>{nextLevelXp.toLocaleString()} XP</span>
      </div>
      <div className="w-full bg-muted rounded-full h-3">
        <div
          className="bg-primary h-3 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Render the community member profile page for the given guild and user.
 *
 * Fetches the user's profile and returns the page markup showing avatar, basic info,
 * level and XP, stats, recent badges, and projects. Triggers a 404 page when the profile
 * cannot be found.
 *
 * @param params - Object containing `guildId` and `userId` path parameters
 * @returns The page JSX that displays the user's public community profile
 */

export default async function ProfilePage({ params }: PageProps) {
  const { guildId, userId } = await params;
  const profile = await fetchProfile(guildId, userId);

  if (!profile) {
    notFound();
  }

  const joinDate = profile.joinedAt
    ? new Date(profile.joinedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back Link */}
        <Link
          href={`/community/${guildId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Community
        </Link>

        {/* Profile Header */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Avatar */}
              <div className="relative">
                {profile.avatar ? (
                  <Image
                    src={profile.avatar}
                    alt={profile.displayName}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-full object-cover ring-2 ring-primary/20"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                    <span className="text-3xl font-bold text-primary">
                      {profile.displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 mb-2">
                  <h1 className="text-2xl font-bold">{profile.displayName}</h1>
                  <Badge variant="secondary">{profile.badge}</Badge>
                </div>
                <p className="text-muted-foreground mb-1">@{profile.username}</p>
                {joinDate && <p className="text-sm text-muted-foreground">Joined {joinDate}</p>}
                <div className="mt-4 max-w-sm">
                  <p className="text-sm font-medium mb-1">Level {profile.level}</p>
                  <XpBar
                    xp={profile.xp}
                    currentLevelXp={profile.currentLevelXp}
                    nextLevelXp={profile.nextLevelXp}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={MessageSquare}
              label="Messages"
              value={profile.stats.messagesSent.toLocaleString()}
            />
            <StatCard icon={Calendar} label="Days Active" value={profile.stats.daysActive} />
            <StatCard icon={Zap} label="XP" value={profile.xp.toLocaleString()} />
            <StatCard
              icon={Heart}
              label="Reactions"
              value={profile.stats.reactionsGiven + profile.stats.reactionsReceived}
            />
          </div>
        </section>

        {/* Badges */}
        {profile.recentBadges.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Badges</h2>
            <div className="flex flex-wrap gap-2">
              {profile.recentBadges.map((badge) => (
                <Badge
                  key={badge.name}
                  variant="outline"
                  className="py-1.5 px-3 text-sm"
                  title={badge.description}
                >
                  {badge.name}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Projects */}
        {profile.projects.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Projects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profile.projects.map((project) => (
                <Card key={project.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{project.title}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {project.tech.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs">
                          {t}
                        </Badge>
                      ))}
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Privacy Notice */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            This profile is public because the user opted in with{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/profile public</code>.
          </p>
        </div>
      </div>
    </main>
  );
}
