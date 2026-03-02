/**
 * Shared API response types for the bot dashboard.
 * These contracts mirror the bot API response shapes; keep in sync with src/api/routes/.
 */

// ── AI Feedback ───────────────────────────────────────────────────────────────

export interface FeedbackTrendPoint {
  date: string;
  positive: number;
  negative: number;
}

export interface FeedbackStats {
  positive: number;
  negative: number;
  total: number;
  ratio: number | null;
  trend: FeedbackTrendPoint[];
}

export interface RecentFeedbackEntry {
  id: number;
  messageId: string;
  channelId: string;
  userId: string;
  feedbackType: 'positive' | 'negative';
  createdAt: string;
  aiResponseContent: string | null;
}
