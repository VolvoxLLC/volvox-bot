'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartTheme } from '@/hooks/use-chart-theme';
import { useGuildSelection } from '@/hooks/use-guild-selection';

interface FeedbackStats {
  positive: number;
  negative: number;
  total: number;
  ratio: number | null;
  trend: Array<{
    date: string;
    positive: number;
    negative: number;
  }>;
}

/**
 * AI Feedback Stats dashboard card.
 * Shows 👍/👎 aggregate counts, approval ratio, and daily trend.
 */
export function AiFeedbackStats() {
  const { selectedGuild, apiBase } = useGuildSelection();
  const chart = useChartTheme();
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!selectedGuild || !apiBase) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/guilds/${selectedGuild.id}/ai-feedback/stats?days=30`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as FeedbackStats;
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback stats');
    } finally {
      setLoading(false);
    }
  }, [selectedGuild, apiBase]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (!selectedGuild) return null;

  const pieData =
    stats && stats.total > 0
      ? [
          { name: '👍 Positive', value: stats.positive },
          { name: '👎 Negative', value: stats.negative },
        ]
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ThumbsUp className="h-5 w-5 text-green-500" />
          AI Response Feedback
        </CardTitle>
        <CardDescription>
          User 👍/👎 reactions on AI-generated messages (last 30 days)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && stats && (
          <div className="space-y-6">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-center gap-1 text-2xl font-bold text-green-500">
                  <ThumbsUp className="h-5 w-5" />
                  {stats.positive}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Positive</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-center gap-1 text-2xl font-bold text-red-500">
                  <ThumbsDown className="h-5 w-5" />
                  {stats.negative}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Negative</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold">
                  {stats.ratio !== null ? `${stats.ratio}%` : '—'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Approval Rate</p>
              </div>
            </div>

            {stats.total === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No feedback yet. Enable <code className="font-mono">ai.feedback.enabled</code> in
                config to start collecting reactions.
              </p>
            )}

            {pieData.length > 0 && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Pie chart */}
                <div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">Overall Split</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {pieData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={chart.palette[index % chart.palette.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar chart trend */}
                {stats.trend.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted-foreground">Daily Trend</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={stats.trend}
                        margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v: string) => v.slice(5)}
                        />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="positive" name="👍" fill={chart.success} stackId="a" />
                        <Bar dataKey="negative" name="👎" fill={chart.danger} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
