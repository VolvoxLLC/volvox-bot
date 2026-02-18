import { Command } from 'commander';
import chalk from 'chalk';
import { api } from '../utils/api.js';
import { findTask } from '../utils/find.js';

interface AgentStatusResponse {
  status: string;
  taskId?: string;
  taskTitle?: string;
  count?: number;
  updatedAt?: string;
}

export function registerAgentStatusCommands(program: Command): void {
  const agent = program.command('agent').description('Agent status commands');

  // Get current agent status
  agent
    .command('status')
    .description('Get current agent status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const status = await api<AgentStatusResponse>('/api/agent/status');

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          const statusColors: Record<string, (s: string) => string> = {
            idle: chalk.dim,
            working: chalk.yellow,
            'sub-agent': chalk.cyan,
          };
          const color = statusColors[status.status] || chalk.white;

          console.log(chalk.bold('\n🤖 Agent Status\n'));
          console.log(chalk.dim('─'.repeat(40)));
          console.log(`  Status: ${color(status.status)}`);

          if (status.taskId) {
            console.log(`  Task: ${chalk.cyan(status.taskId)}`);
          }
          if (status.taskTitle) {
            console.log(`  Title: ${chalk.white(status.taskTitle)}`);
          }
          if (status.count !== undefined) {
            console.log(`  Sub-agents: ${chalk.white(String(status.count))}`);
          }
          if (status.updatedAt) {
            console.log(`  Updated: ${chalk.dim(new Date(status.updatedAt).toLocaleString())}`);
          }

          console.log(chalk.dim('─'.repeat(40)));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Set working status
  agent
    .command('working <id>')
    .description('Set agent status to working on a task')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        const task = await findTask(id);
        if (!task) {
          console.error(chalk.red(`Task not found: ${id}`));
          process.exit(1);
        }

        const result = await api<AgentStatusResponse>('/api/agent/status', {
          method: 'POST',
          body: JSON.stringify({
            status: 'working',
            taskId: task.id,
            taskTitle: task.title,
          }),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.green(`✓ Agent status: working on ${task.title}`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Set idle status
  agent
    .command('idle')
    .description('Set agent status to idle')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const result = await api<AgentStatusResponse>('/api/agent/status', {
          method: 'POST',
          body: JSON.stringify({ status: 'idle' }),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.green('✓ Agent status: idle'));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Set sub-agent status
  agent
    .command('sub-agent <count>')
    .description('Set agent status to sub-agent mode with count')
    .option('--json', 'Output as JSON')
    .action(async (count, options) => {
      try {
        const n = parseInt(count, 10);
        if (isNaN(n) || n < 0) {
          console.error(chalk.red('Count must be a non-negative number'));
          process.exit(1);
        }

        const result = await api<AgentStatusResponse>('/api/agent/status', {
          method: 'POST',
          body: JSON.stringify({ status: 'sub-agent', count: n }),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.green(`✓ Agent status: sub-agent (${n} running)`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
