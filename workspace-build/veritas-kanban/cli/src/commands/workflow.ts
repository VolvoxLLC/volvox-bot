import { Command } from 'commander';
import chalk from 'chalk';
import { api } from '../utils/api.js';
import { findTask } from '../utils/find.js';
import type { Task } from '../utils/types.js';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

export function registerWorkflowCommands(program: Command): void {
  // vk begin <id> — Start working on a task
  program
    .command('begin <id>')
    .description('Begin working on a task (sets in-progress, starts timer, updates agent status)')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const task = await findTask(id);
        if (!task) {
          console.error(chalk.red(`Task not found: ${id}`));
          process.exit(1);
        }

        const results: Record<string, unknown> = {};

        // 1. Set status to in-progress
        const updated = await api<Task>(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'in-progress' }),
        });
        results.taskUpdate = updated;

        // 2. Start timer
        try {
          const timeResult = await api<unknown>(`/api/tasks/${task.id}/time/start`, {
            method: 'POST',
          });
          results.timeStart = timeResult;
        } catch (err) {
          results.timeStart = { error: (err as Error).message };
        }

        // 3. Update agent status
        try {
          const agentResult = await api<unknown>('/api/agent/status', {
            method: 'POST',
            body: JSON.stringify({
              status: 'working',
              taskId: task.id,
              taskTitle: task.title,
            }),
          });
          results.agentStatus = agentResult;
        } catch (err) {
          results.agentStatus = { error: (err as Error).message };
        }

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(chalk.green(`⏱️  Timer started on: ${task.title}`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // vk done <id> "summary" — Complete a task
  program
    .command('done <id> [summary]')
    .description('Complete a task (stops timer, sets done, adds comment, sets agent idle)')
    .option('--json', 'Output as JSON')
    .action(async (id, summary, options) => {
      try {
        const task = await findTask(id);
        if (!task) {
          console.error(chalk.red(`Task not found: ${id}`));
          process.exit(1);
        }

        const results: Record<string, unknown> = {};

        // 1. Stop timer (may fail if not running — that's OK)
        try {
          const timeResult = await api<unknown>(`/api/tasks/${task.id}/time/stop`, {
            method: 'POST',
          });
          results.timeStop = timeResult;
        } catch (err) {
          results.timeStop = { error: (err as Error).message };
        }

        // 2. Set status to done
        const updated = await api<Task>(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'done' }),
        });
        results.taskUpdate = updated;

        // 3. Add comment with summary
        if (summary) {
          try {
            const commentResult = await api<unknown>(`/api/tasks/${task.id}/comments`, {
              method: 'POST',
              body: JSON.stringify({ author: 'Veritas', text: summary }),
            });
            results.comment = commentResult;
          } catch (err) {
            results.comment = { error: (err as Error).message };
          }
        }

        // 4. Set agent status to idle
        try {
          const agentResult = await api<unknown>('/api/agent/status', {
            method: 'POST',
            body: JSON.stringify({ status: 'idle' }),
          });
          results.agentStatus = agentResult;
        } catch (err) {
          results.agentStatus = { error: (err as Error).message };
        }

        // Get updated task for time info
        const finalTask = await findTask(id);
        const totalSeconds = finalTask?.timeTracking?.totalSeconds || 0;
        const timeFormatted = formatDuration(totalSeconds);

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(chalk.green(`✅ Completed: ${task.title} — ${timeFormatted}`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // vk block <id> "reason" — Block a task
  program
    .command('block <id> <reason>')
    .description('Block a task with a reason')
    .option('--json', 'Output as JSON')
    .action(async (id, reason, options) => {
      try {
        const task = await findTask(id);
        if (!task) {
          console.error(chalk.red(`Task not found: ${id}`));
          process.exit(1);
        }

        const results: Record<string, unknown> = {};

        // 1. Set status to blocked
        const updated = await api<Task>(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'blocked' }),
        });
        results.taskUpdate = updated;

        // 2. Add comment with reason
        try {
          const commentResult = await api<unknown>(`/api/tasks/${task.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ author: 'Veritas', text: `🚧 Blocked: ${reason}` }),
          });
          results.comment = commentResult;
        } catch (err) {
          results.comment = { error: (err as Error).message };
        }

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(chalk.green(`🚧 Blocked: ${task.title}`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // vk unblock <id> — Unblock a task
  program
    .command('unblock <id>')
    .description('Unblock a task (sets in-progress, restarts timer)')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const task = await findTask(id);
        if (!task) {
          console.error(chalk.red(`Task not found: ${id}`));
          process.exit(1);
        }

        const results: Record<string, unknown> = {};

        // 1. Set status to in-progress
        const updated = await api<Task>(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'in-progress' }),
        });
        results.taskUpdate = updated;

        // 2. Start timer
        try {
          const timeResult = await api<unknown>(`/api/tasks/${task.id}/time/start`, {
            method: 'POST',
          });
          results.timeStart = timeResult;
        } catch (err) {
          results.timeStart = { error: (err as Error).message };
        }

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(chalk.green(`🔓 Unblocked: ${task.title} — Timer restarted`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
