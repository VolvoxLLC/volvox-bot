import { Command } from 'commander';
import chalk from 'chalk';
import { api } from '../utils/api.js';

export function registerNotificationCommands(program: Command): void {
  // Send a notification
  program
    .command('notify <message>')
    .description('Create a notification')
    .option(
      '-t, --type <type>',
      'Notification type (info, error, milestone, high_priority)',
      'info'
    )
    .option('--title <title>', 'Notification title')
    .option('--task <id>', 'Related task ID')
    .option('--json', 'Output as JSON')
    .action(async (message, options) => {
      try {
        const notification = await api<{ id: string; type: string; title: string }>(
          '/api/notifications',
          {
            method: 'POST',
            body: JSON.stringify({
              type: options.type,
              title:
                options.title ||
                (options.type === 'error'
                  ? 'Error'
                  : options.type === 'milestone'
                    ? 'Milestone'
                    : 'Notification'),
              message,
              taskId: options.task,
            }),
          }
        );

        if (options.json) {
          console.log(JSON.stringify(notification, null, 2));
        } else {
          console.log(chalk.green('✓ Notification created'));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Check for notifications
  program
    .command('notify:check')
    .description('Check for tasks that need notifications')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const result = await api<{ checked: number; created: number }>('/api/notifications/check', {
          method: 'POST',
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.dim(`Checked ${result.checked} tasks`));
          if (result.created > 0) {
            console.log(chalk.yellow(`Created ${result.created} new notifications`));
          } else {
            console.log(chalk.dim('No new notifications'));
          }
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Get pending notifications
  program
    .command('notify:pending')
    .description('Get pending notifications formatted for Teams')
    .option('--json', 'Output raw JSON')
    .option('--mark-sent', 'Mark notifications as sent after output')
    .action(async (options) => {
      try {
        const result = await api<{
          count: number;
          messages: { id: string; type: string; text: string; timestamp: string }[];
        }>('/api/notifications/pending');

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.count === 0) {
          console.log(chalk.dim('No pending notifications'));
        } else {
          result.messages.forEach(
            (msg: { id: string; type: string; text: string; timestamp: string }) => {
              console.log(msg.text);
              console.log(chalk.dim('─'.repeat(40)));
            }
          );
        }

        if (options.markSent && result.count > 0) {
          const ids = result.messages.map(
            (m: { id: string; type: string; text: string; timestamp: string }) => m.id
          );
          await api('/api/notifications/mark-sent', {
            method: 'POST',
            body: JSON.stringify({ ids }),
          });
          console.log(chalk.dim(`Marked ${ids.length} notifications as sent`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // List all notifications
  program
    .command('notify:list')
    .description('List all notifications')
    .option('-u, --unsent', 'Show only unsent notifications')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const url = options.unsent ? '/api/notifications?unsent=true' : '/api/notifications';
        const notifications =
          await api<
            {
              id: string;
              type: string;
              title: string;
              message: string;
              sent: boolean;
              timestamp: string;
            }[]
          >(url);

        if (options.json) {
          console.log(JSON.stringify(notifications, null, 2));
        } else if (notifications.length === 0) {
          console.log(chalk.dim('No notifications'));
        } else {
          const typeIcons: Record<string, string> = {
            agent_complete: '✅',
            agent_failed: '❌',
            needs_review: '👀',
            task_done: '🎉',
            high_priority: '🔴',
            error: '⚠️',
            milestone: '🏆',
            info: 'ℹ️',
          };

          notifications.forEach(
            (n: {
              id: string;
              type: string;
              title: string;
              message: string;
              sent: boolean;
              timestamp: string;
            }) => {
              const icon = typeIcons[n.type] || '•';
              const sent = n.sent ? chalk.dim('[sent]') : chalk.yellow('[pending]');
              console.log(`${icon} ${chalk.bold(n.title)} ${sent}`);
              console.log(
                chalk.dim(`   ${n.message.slice(0, 60)}${n.message.length > 60 ? '...' : ''}`)
              );
            }
          );
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // Clear notifications
  program
    .command('notify:clear')
    .description('Clear all notifications')
    .action(async () => {
      try {
        await api('/api/notifications', { method: 'DELETE' });
        console.log(chalk.green('✓ Notifications cleared'));
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
