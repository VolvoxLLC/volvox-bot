/**
 * Blocking Service
 *
 * Handles task blocking/dependency logic.
 * Extracted from tasks.ts route to separate business logic from HTTP concerns.
 */

import type { Task } from '@veritas-kanban/shared';

export interface BlockerInfo {
  id: string;
  title: string;
  status?: string;
}

export interface BlockingStatus {
  isBlocked: boolean;
  blockers: BlockerInfo[];
  completedBlockers: BlockerInfo[];
}

export class BlockingService {
  /**
   * Get the blocking status for a task
   */
  getBlockingStatus(task: Task, allTasks: Task[]): BlockingStatus {
    if (!task.blockedBy?.length) {
      return { isBlocked: false, blockers: [], completedBlockers: [] };
    }

    const blockingTasks = allTasks.filter((t) => task.blockedBy?.includes(t.id));
    const incompleteBlockers = blockingTasks.filter((t) => t.status !== 'done');
    const completedBlockers = blockingTasks.filter((t) => t.status === 'done');

    return {
      isBlocked: incompleteBlockers.length > 0,
      blockers: incompleteBlockers.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
      })),
      completedBlockers: completedBlockers.map((t) => ({
        id: t.id,
        title: t.title,
      })),
    };
  }

  /**
   * Check if a task can move to in-progress (i.e., all blockers are done)
   */
  canMoveToInProgress(
    task: Task,
    allTasks: Task[]
  ): { allowed: boolean; blockers?: BlockerInfo[] } {
    if (!task.blockedBy?.length) {
      return { allowed: true };
    }

    const blockingTasks = allTasks.filter((t) => task.blockedBy?.includes(t.id));
    const incompleteBlockers = blockingTasks.filter((t) => t.status !== 'done');

    if (incompleteBlockers.length > 0) {
      return {
        allowed: false,
        blockers: incompleteBlockers.map((t) => ({ id: t.id, title: t.title })),
      };
    }

    return { allowed: true };
  }

  /**
   * Get all tasks that are blocked by a given task
   */
  getDependentTasks(taskId: string, allTasks: Task[]): Task[] {
    return allTasks.filter((t) => t.blockedBy?.includes(taskId));
  }

  /**
   * Check if completing a task would unblock other tasks
   */
  getTasksThatWouldBeUnblocked(taskId: string, allTasks: Task[]): Task[] {
    const dependentTasks = this.getDependentTasks(taskId, allTasks);

    return dependentTasks.filter((task) => {
      // Check if this is the only incomplete blocker
      const otherBlockers = task.blockedBy?.filter((id: string) => id !== taskId) || [];
      const otherIncompleteBlockers = otherBlockers.filter((blockerId: string) => {
        const blockerTask = allTasks.find((t: Task) => t.id === blockerId);
        return blockerTask && blockerTask.status !== 'done';
      });

      return otherIncompleteBlockers.length === 0;
    });
  }

  /**
   * Validate that adding a blocker wouldn't create a circular dependency
   */
  wouldCreateCircularDependency(taskId: string, newBlockerId: string, allTasks: Task[]): boolean {
    // Check if the new blocker (or any of its blockers) depends on taskId
    const visited = new Set<string>();
    const queue = [newBlockerId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (currentId === taskId) {
        return true; // Circular dependency detected
      }

      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const task = allTasks.find((t) => t.id === currentId);
      if (task?.blockedBy) {
        queue.push(...task.blockedBy);
      }
    }

    return false;
  }
}

// Singleton instance
let instance: BlockingService | null = null;

export function getBlockingService(): BlockingService {
  if (!instance) {
    instance = new BlockingService();
  }
  return instance;
}
