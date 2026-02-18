/**
 * Types for the efficient agent polling endpoint (GET /api/changes)
 * Allows agents to poll for everything that changed since their last check.
 */

import type { Task, Comment } from './task.types.js';

export interface Activity {
  id: string;
  type: string;
  taskId: string;
  taskTitle: string;
  agent?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface BroadcastMessage {
  id: string;
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface TaskChanges {
  created: Task[];
  updated: Task[];
}

export interface CommentChange {
  taskId: string;
  comment: Comment;
}

export interface ChangesResponse {
  since: string;
  until: string;
  changes: {
    tasks: TaskChanges;
    comments: CommentChange[];
    activity: Activity[];
    broadcasts: BroadcastMessage[];
  };
  summary: {
    totalChanges: number;
    breakdown: Record<string, number>;
  };
}

export interface ChangesQueryParams {
  since: string; // ISO timestamp, required
  full?: boolean; // Return full objects vs summaries (optional)
  types?: string; // Comma-separated: tasks,comments,activity,broadcasts (optional)
}
