'use client';

import { Calendar, Clock, Hash, MessageSquare, Shield, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format-time';
import { ActionBadge } from './action-badge';
import type { ModCase } from './moderation-types';
import { ACTION_META } from './moderation-types';

interface FieldRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function FieldRow({ icon, label, value }: FieldRowProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm">{value}</div>
      </div>
    </div>
  );
}

interface CaseDetailProps {
  modCase: ModCase;
}

export function CaseDetail({ modCase }: CaseDetailProps) {
  const pendingScheduled = modCase.scheduledActions?.filter((a) => !a.executed) ?? [];
  const executedScheduled = modCase.scheduledActions?.filter((a) => a.executed) ?? [];

  return (
    <Card
      className="border-l-4"
      style={{ borderLeftColor: ACTION_META[modCase.action]?.color ?? '#6366F1' }}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4 text-muted-foreground" />
          Case #{modCase.case_number}
          <ActionBadge action={modCase.action} size="md" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 divide-y divide-border">
        <FieldRow
          icon={<User className="h-4 w-4" />}
          label="Target"
          value={
            <span className="font-mono text-sm">
              {modCase.target_tag}{' '}
              <span className="text-muted-foreground text-xs">({modCase.target_id})</span>
            </span>
          }
        />

        <FieldRow
          icon={<Shield className="h-4 w-4" />}
          label="Moderator"
          value={
            <span className="font-mono text-sm">
              {modCase.moderator_tag}{' '}
              <span className="text-muted-foreground text-xs">({modCase.moderator_id})</span>
            </span>
          }
        />

        <FieldRow
          icon={<MessageSquare className="h-4 w-4" />}
          label="Reason"
          value={
            <span className={modCase.reason ? '' : 'italic text-muted-foreground'}>
              {modCase.reason ?? 'No reason provided'}
            </span>
          }
        />

        <FieldRow
          icon={<Calendar className="h-4 w-4" />}
          label="Created"
          value={formatDate(modCase.created_at)}
        />

        {modCase.duration && (
          <FieldRow
            icon={<Clock className="h-4 w-4" />}
            label="Duration"
            value={modCase.duration}
          />
        )}

        {modCase.expires_at && (
          <FieldRow
            icon={<Clock className="h-4 w-4" />}
            label="Expires"
            value={formatDate(modCase.expires_at)}
          />
        )}

        {/* Scheduled actions */}
        {(pendingScheduled.length > 0 || executedScheduled.length > 0) && (
          <div className="pt-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Scheduled Actions</p>
            <ul className="space-y-1.5">
              {[...pendingScheduled, ...executedScheduled].map((sa) => (
                <li key={sa.id} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <ActionBadge action={sa.action} />
                    <span className="text-muted-foreground">{formatDate(sa.execute_at)}</span>
                  </span>
                  <Badge variant={sa.executed ? 'secondary' : 'outline'} className="text-xs">
                    {sa.executed ? 'Executed' : 'Pending'}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
