'use client';

import { Bot, MessageSquareWarning, Sparkles, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfigContext } from '@/components/dashboard/config-context';
import { CONFIG_CATEGORIES } from '@/components/dashboard/config-workspace/config-categories';
import type { ConfigCategoryIcon } from '@/components/dashboard/config-workspace/types';

const CATEGORY_ICONS: Record<ConfigCategoryIcon, typeof Sparkles> = {
  sparkles: Sparkles,
  users: Users,
  'message-square-warning': MessageSquareWarning,
  bot: Bot,
  ticket: Ticket,
};

/**
 * Landing page content for the config editor.
 * Renders a responsive grid of category cards with dirty count badges.
 */
export function ConfigLandingContent() {
  const { dirtyCategoryCounts, loading } = useConfigContext();

  if (loading) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CONFIG_CATEGORIES.map((category) => {
        const Icon = CATEGORY_ICONS[category.icon];
        const dirtyCount = dirtyCategoryCounts[category.id];

        return (
          <Link
            key={category.id}
            href={`/dashboard/config/${category.id}`}
            className="group"
          >
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <CardTitle className="text-base">{category.label}</CardTitle>
                  </div>
                  {dirtyCount > 0 && (
                    <Badge variant="default" className="min-w-5 justify-center px-1.5">
                      {dirtyCount}
                    </Badge>
                  )}
                </div>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
