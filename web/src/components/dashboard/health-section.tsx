'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { extractApiError, isAbortError, safeParseJson, toErrorMessage } from '@/lib/api-utils';
import { HealthCards } from './health-cards';
import { RestartHistory } from './restart-history';
import { type BotHealth, validateBotHealth } from './types';

const AUTO_REFRESH_MS = 60_000;

function formatLastUpdated(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function HealthSection() {
  const router = useRouter();
  const guildId = useGuildSelection();
  const [health, setHealth] = useState<BotHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchHealth = useCallback(
    async (backgroundRefresh = false) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const didSetLoading = !backgroundRefresh;

      if (!backgroundRefresh) {
        setLoading(true);
        setError(null);
      }

      try {
        if (!guildId) {
          return;
        }

        const params = new URLSearchParams({ guildId });
        const response = await fetch(`/api/bot-health?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (response.status === 401) {
          router.replace('/login');
          return;
        }

        const payload = await safeParseJson(response);

        if (!response.ok) {
          throw new Error(extractApiError(payload, 'Failed to fetch health data'));
        }

        const validationError = validateBotHealth(payload);
        if (validationError) {
          throw new Error(`Invalid health payload: ${validationError}`);
        }

        setHealth(payload as BotHealth);
        setError(null);
        setLastUpdatedAt(new Date());
      } catch (fetchError) {
        if (isAbortError(fetchError)) return;
        setError(toErrorMessage(fetchError, 'Failed to fetch health data'));
      } finally {
        if (didSetLoading) {
          setLoading(false);
        }
      }
    },
    [guildId, router],
  );

  // Initial fetch
  useEffect(() => {
    fetchHealth();
    return () => abortControllerRef.current?.abort();
  }, [fetchHealth]);

  // Auto-refresh every 60s
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchHealth(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchHealth]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bot Health</h2>
          <p className="text-muted-foreground">
            Live metrics and restart history. Auto-refreshes every 60s.
          </p>
          {lastUpdatedAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last updated {formatLastUpdated(lastUpdatedAt)}
            </p>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={() => fetchHealth()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <strong>Failed to load health data:</strong> {error}
          <Button variant="outline" size="sm" className="ml-4" onClick={() => fetchHealth()}>
            Try again
          </Button>
        </div>
      ) : null}

      <HealthCards health={health} loading={loading} />
      <RestartHistory health={health} loading={loading} />
    </div>
  );
}
