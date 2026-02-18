import { Command } from 'commander';
import chalk from 'chalk';
import { api } from '../utils/api.js';
import { findTask } from '../utils/find.js';

export function registerCommentCommands(program: Command): void {
  program
    .command('comment <id> <text>')
    .description('Add a comment to a task')
    .option('-a, --author <name>', 'Comment author', 'Veritas')
    .option('--json', 'Output as JSON')
    .action(async (id, text, options) => {
      try {
        const task = await findTask(id);
        if (!task) {
          console.error(chalk.red(`Task not found: ${id}`));
          process.exit(1);
        }

        const result = await api<unknown>(`/api/tasks/${task.id}/comments`, {
          method: 'POST',
          body: JSON.stringify({ text, author: options.author }),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.green(`✓ Comment added to: ${task.title}`));
          console.log(chalk.dim(`  Author: ${options.author}`));
          console.log(chalk.dim(`  Text: ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
