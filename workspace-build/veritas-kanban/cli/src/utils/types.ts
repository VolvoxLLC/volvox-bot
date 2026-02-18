// Re-export shared types
export type { Task } from '@veritas-kanban/shared';

// Metrics types
export interface TokenMetrics {
  period: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  runs: number;
  perSuccessfulRun: {
    avg: number;
    p50: number;
    p95: number;
  };
  byAgent: Array<{
    agent: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    runs: number;
  }>;
}

export interface DurationMetrics {
  period: string;
  runs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  byAgent: Array<{
    agent: string;
    runs: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
  }>;
}

export interface TaskCostEntry {
  taskId: string;
  taskTitle?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  runs: number;
  avgCostPerRun: number;
}

export interface TaskCostMetrics {
  period: string;
  tasks: TaskCostEntry[];
  totalCost: number;
  avgCostPerTask: number;
}
