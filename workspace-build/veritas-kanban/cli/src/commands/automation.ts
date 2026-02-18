import { Command } from 'commander';
import chalk from 'chalk';
import { api } from '../utils/api.js';
import { findTask } from '../utils/find.js';
import { formatTask, formatTasksJson } from '../utils/format.js';
import type { Task } from '../utils/types.js';

export function registerAutomationCommands(program: Command): void {
  // List pending automation tasks
  program
    .command('automation:pending')
    .alias('ap')
    .description('List automation tasks pending execution')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const tasks = await api<Task[]>('/api/automation/pending');

        if (options.json) {
          console.log(formatTasksJson(tasks));
        } else if (tasks.length === 0) {
          console.log(chalk.dim('No pending automation tasks'));
        } else {
          console.log(chalk.bold('Pending Automation Tasks:\n'));
          tasks.forEach((task: Task) => console.log(formatTask(task, true)));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // List running automation tasks
  program
    .command('automation:running')
    .alias('ar')
    .description('List currently running automation tasks')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const tasks = await api<Task[]>('/api/automation/running');

        if (options.json) {
          console.log(formatTasksJson(tasks));
        } else if (tasks.length === 0) {
          console.log(chalk.dim('No running automation tasks'));
        } else {
          console.log(chalk.bold('Running Automation Tasks:\n'));
          tasks.forEach((task: Task) => console.log(formatTask(task, true)));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Start automation task (for Veritas to call)
  program
    .command('automation:start <id>')
    .alias('as')
    .description('Start an automation task via Veritas sub-agent')
    .option('-s, --session <key>', 'Clawdbot session key')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const task = await findTask(id);

        if (!task) {
          console.error(chalk.red(`Task not found: ${id}`));
          process.exit(1);
        }

        const result = await api<{
          taskId: string;
          attemptId: string;
          title: string;
          description: string;
        }>(`/api/automation/${task.id}/start`, {
          method: 'POST',
          body: JSON.stringify({ sessionKey: options.session }),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.green('✓ Automation started'));
          console.log(chalk.dim(`Task: ${result.title}`));
          console.log(chalk.dim(`Attempt: ${result.attemptId}`));
          if (result.description) {
            console.log(chalk.dim(`\nDescription:\n${result.description}`));
          }
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Complete automation task
  program
    .command('automation:complete <id>')
    .alias('ac')
    .description('Mark an automation task as complete')
    .option('-r, --result <text>', 'Result summary')
    .option('-f, --failed', 'Mark as failed instead of complete')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const task = await findTask(id);

        if (!task) {
          console.error(chalk.red(`Task not found: ${id}`));
          process.exit(1);
        }

        const result = await api<{ taskId: string; status: string }>(
          `/api/automation/${task.id}/complete`,
          {
            method: 'POST',
            body: JSON.stringify({
              result: options.result,
              status: options.failed ? 'failed' : 'complete',
            }),
          }
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.status === 'complete') {
            console.log(chalk.green('✓ Automation completed'));
          } else {
            console.log(chalk.yellow('✓ Automation marked as failed'));
          }
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
