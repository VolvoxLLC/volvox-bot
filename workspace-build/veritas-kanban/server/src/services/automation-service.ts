/**
 * Automation Service
 * 
 * Handles automation task scheduling, lifecycle, and state management.
 * Extracted from automation.ts route to separate business logic from HTTP concerns.
 */

import { nanoid } from 'nanoid';
import type { Task } from '@veritas-kanban/shared';

export interface AutomationStartResult {
  taskId: string;
  attemptId: string;
  title: string;
  description: string;
  project?: string;
  automation?: Task['automation'];
}

export interface AutomationCompleteResult {
  taskId: string;
  status: 'complete' | 'failed';
  automation?: Task['automation'];
}

export interface AutomationTaskFilter {
  pending?: boolean;
  running?: boolean;
  failed?: boolean;
}

export class AutomationService {
  // ============ Task Filtering / Scheduling Decisions ============

  /**
   * Find tasks pending automation execution.
   * These are automation tasks that are either:
   * 1. Type automation AND status todo (not yet started)
   * 2. OR have a failed veritas attempt and need retry
   */
  getPendingTasks(tasks: Task[]): Task[] {
    return tasks.filter(task => {
      if (task.type !== 'automation') return false;
      if (task.status === 'todo') return true;
      if (task.status === 'blocked' && task.attempt?.agent === 'veritas' && task.attempt?.status === 'failed') {
        return true; // Failed, might need retry
      }
      return false;
    });
  }

  /**
   * Find currently running automation tasks
   */
  getRunningTasks(tasks: Task[]): Task[] {
    return tasks.filter(task => 
      task.type === 'automation' && 
      task.attempt?.agent === 'veritas' && 
      task.attempt?.status === 'running'
    );
  }

  /**
   * Find failed automation tasks that might need attention
   */
  getFailedTasks(tasks: Task[]): Task[] {
    return tasks.filter(task =>
      task.type === 'automation' &&
      task.attempt?.status === 'failed' &&
      task.status !== 'done'
    );
  }

  /**
   * Get all automation tasks by filter
   */
  filterTasks(tasks: Task[], filter: AutomationTaskFilter): Task[] {
    let result: Task[] = [];
    
    if (filter.pending) {
      result = [...result, ...this.getPendingTasks(tasks)];
    }
    if (filter.running) {
      result = [...result, ...this.getRunningTasks(tasks)];
    }
    if (filter.failed) {
      result = [...result, ...this.getFailedTasks(tasks)];
    }
    
    // Remove duplicates
    const seen = new Set<string>();
    return result.filter(task => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  }

  // ============ Lifecycle Logic ============

  /**
   * Validate that a task can start automation
   */
  validateCanStart(task: Task): { valid: boolean; error?: string } {
    if (task.type !== 'automation') {
      return { valid: false, error: 'Task must be of type "automation"' };
    }
    return { valid: true };
  }

  /**
   * Generate the update payload for starting automation
   */
  getStartPayload(sessionKey?: string): {
    status: 'in-progress';
    attempt: Task['attempt'];
    automation: Task['automation'];
  } {
    const attemptId = `attempt_${nanoid(8)}`;
    const now = new Date().toISOString();
    
    return {
      status: 'in-progress',
      attempt: {
        id: attemptId,
        agent: 'veritas',
        status: 'running',
        started: now,
      },
      automation: {
        sessionKey,
        spawnedAt: now,
      },
    };
  }

  /**
   * Build the start result from an updated task
   */
  buildStartResult(task: Task, attemptId: string): AutomationStartResult {
    return {
      taskId: task.id,
      attemptId,
      title: task.title,
      description: task.description,
      project: task.project,
      automation: task.automation,
    };
  }

  /**
   * Validate that a task can be completed
   */
  validateCanComplete(task: Task): { valid: boolean; error?: string } {
    if (!task.attempt || task.attempt.agent !== 'veritas') {
      return { valid: false, error: 'Task does not have an active veritas attempt' };
    }
    return { valid: true };
  }

  /**
   * Generate the update payload for completing automation
   */
  getCompletePayload(
    existingAttempt: Task['attempt'],
    existingAutomation: Task['automation'],
    result?: string,
    status: 'complete' | 'failed' = 'complete'
  ): {
    status: 'done' | 'blocked';
    attempt: Task['attempt'];
    automation: Task['automation'];
  } {
    const isSuccess = status === 'complete';
    const now = new Date().toISOString();
    
    return {
      status: isSuccess ? 'done' : 'blocked',
      attempt: {
        ...existingAttempt!,
        status: isSuccess ? 'complete' : 'failed',
        ended: now,
      },
      automation: {
        ...existingAutomation,
        completedAt: now,
        result,
      },
    };
  }

  /**
   * Build the complete result from an updated task
   */
  buildCompleteResult(task: Task, status: 'complete' | 'failed'): AutomationCompleteResult {
    return {
      taskId: task.id,
      status,
      automation: task.automation,
    };
  }
}

// Singleton instance
let instance: AutomationService | null = null;

export function getAutomationService(): AutomationService {
  if (!instance) {
    instance = new AutomationService();
  }
  return instance;
}
