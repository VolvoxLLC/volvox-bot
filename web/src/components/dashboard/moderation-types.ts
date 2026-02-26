/** A single moderation case row from the bot database. */
export interface ModCase {
  id: number;
  guild_id: string;
  case_number: number;
  action: ModAction;
  target_id: string;
  target_tag: string;
  moderator_id: string;
  moderator_tag: string;
  reason: string | null;
  duration: string | null;
  expires_at: string | null;
  log_message_id: string | null;
  created_at: string;
  scheduledActions?: ScheduledAction[];
}

/** Supported moderation action types. */
export type ModAction =
  | 'warn'
  | 'kick'
  | 'ban'
  | 'tempban'
  | 'unban'
  | 'softban'
  | 'timeout'
  | 'untimeout'
  | 'purge'
  | 'lock'
  | 'unlock'
  | 'slowmode';

/** A scheduled action linked to a mod case (e.g. scheduled unban for tempban). */
export interface ScheduledAction {
  id: number;
  action: ModAction;
  target_id: string;
  execute_at: string;
  executed: boolean;
  created_at: string;
}

/** Paginated response from GET /api/moderation/cases. */
export interface CaseListResponse {
  cases: ModCase[];
  total: number;
  page: number;
  pages: number;
}

/** Stats summary from GET /api/moderation/stats. */
export interface ModStats {
  totalCases: number;
  last24h: number;
  last7d: number;
  byAction: Partial<Record<ModAction, number>>;
  topTargets: Array<{
    userId: string;
    tag: string;
    count: number;
  }>;
}

/** Color and display metadata for each action type. */
export const ACTION_META: Record<ModAction, { label: string; badge: string; color: string }> = {
  warn: {
    label: 'Warn',
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    color: '#EAB308',
  },
  kick: {
    label: 'Kick',
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    color: '#F97316',
  },
  ban: {
    label: 'Ban',
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    color: '#EF4444',
  },
  tempban: {
    label: 'Tempban',
    badge: 'bg-red-600/20 text-red-300 border-red-600/30',
    color: '#DC2626',
  },
  unban: {
    label: 'Unban',
    badge: 'bg-green-500/20 text-green-400 border-green-500/30',
    color: '#22C55E',
  },
  softban: {
    label: 'Softban',
    badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    color: '#F43F5E',
  },
  timeout: {
    label: 'Timeout',
    badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    color: '#A855F7',
  },
  untimeout: {
    label: 'Untimeout',
    badge: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    color: '#8B5CF6',
  },
  purge: {
    label: 'Purge',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    color: '#3B82F6',
  },
  lock: {
    label: 'Lock',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    color: '#F59E0B',
  },
  unlock: {
    label: 'Unlock',
    badge: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    color: '#14B8A6',
  },
  slowmode: {
    label: 'Slowmode',
    badge: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    color: '#6366F1',
  },
};
