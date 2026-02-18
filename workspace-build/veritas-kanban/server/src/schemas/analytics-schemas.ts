import { z } from 'zod';

/**
 * Analytics Schemas
 * Validates query parameters and request bodies for analytics endpoints
 */

/**
 * Timeline Query Schema
 * GET /api/analytics/timeline?from=ISO&to=ISO&agent=X&project=Y
 */
export const TimelineQuerySchema = z.object({
  from: z.string().datetime().optional().describe('Start date (ISO 8601)'),
  to: z.string().datetime().optional().describe('End date (ISO 8601)'),
  agent: z.string().optional().describe('Filter by agent type'),
  project: z.string().optional().describe('Filter by project'),
  sprint: z.string().optional().describe('Filter by sprint'),
});

export type TimelineQuery = z.infer<typeof TimelineQuerySchema>;

/**
 * Metrics Query Schema
 * GET /api/analytics/metrics?sprint=X&from=ISO&to=ISO&project=Y
 */
export const MetricsQuerySchema = z.object({
  sprint: z.string().optional().describe('Sprint ID/name'),
  from: z.string().datetime().optional().describe('Start date (ISO 8601)'),
  to: z.string().datetime().optional().describe('End date (ISO 8601)'),
  project: z.string().optional().describe('Filter by project'),
});

export type MetricsQuery = z.infer<typeof MetricsQuerySchema>;

/**
 * Timeline data for a task
 */
export interface TaskTimeline {
  id: string;
  title: string;
  project?: string;
  sprint?: string;
  agent?: string;
  status: string;
  startTime?: string; // ISO timestamp of first time entry
  endTime?: string; // ISO timestamp of last time entry
  durationSeconds: number; // Total tracked time
  timeEntries: {
    id: string;
    startTime: string;
    endTime?: string;
    duration?: number; // seconds
    description?: string;
  }[];
}

/**
 * Parallelism snapshot at a specific point in time
 */
export interface ParallelismSnapshot {
  timestamp: string;
  concurrentTaskCount: number;
  taskIds: string[];
}

/**
 * Timeline response
 */
export interface TimelineResponse {
  period: {
    from: string;
    to: string;
  };
  tasks: TaskTimeline[];
  parallelism: ParallelismSnapshot[];
  summary: {
    totalTasks: number;
    maxConcurrency: number;
    averageConcurrency: number;
    timelineStartTime?: string;
    timelineEndTime?: string;
  };
}

/**
 * Agent activity period
 */
export interface AgentPeriod {
  agent: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  tasksCompleted: number;
  totalTaskDurationSeconds: number;
}

/**
 * Aggregate metrics response
 */
export interface MetricsResponse {
  period: {
    from: string;
    to: string;
    sprint?: string;
  };
  parallelism: {
    averageConcurrency: number;
    maxConcurrency: number;
    minConcurrency: number;
  };
  throughput: {
    tasksCompleted: number;
    tasksCreated: number;
    averageCompletionTime: number; // seconds
  };
  leadTime: {
    fromTodoToDone: number; // seconds (average)
    fromCreatedToStarted: number; // seconds (average)
    fromStartedToDone: number; // seconds (average)
  };
  agentUtilization: AgentPeriod[];
  efficiency: {
    totalTrackedTime: number; // seconds
    totalTaskCount: number;
    averageTimePerTask: number; // seconds
    utilizationRate: number; // 0-1, ratio of active time to total period
  };
}

/**
 * Errors that can be thrown during analytics operations
 */
export class AnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsError';
  }
}
