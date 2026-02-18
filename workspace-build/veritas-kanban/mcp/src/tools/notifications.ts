import { api } from '../utils/api.js';

export const notificationTools = [
  {
    name: 'create_notification',
    description: 'Create a notification (for Teams delivery)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['info', 'error', 'milestone', 'high_priority', 'agent_complete', 'agent_failed', 'needs_review', 'task_done'],
          description: 'Notification type',
        },
        title: {
          type: 'string',
          description: 'Notification title',
        },
        message: {
          type: 'string',
          description: 'Notification message',
        },
        taskId: {
          type: 'string',
          description: 'Related task ID (optional)',
        },
      },
      required: ['type', 'title', 'message'],
    },
  },
  {
    name: 'get_pending_notifications',
    description: 'Get pending notifications formatted for Teams',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'check_notifications',
    description: 'Check for tasks that need notifications (review ready, agent failed, etc.)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handleNotificationTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'create_notification': {
      const { type, title, message, taskId } = args as { type: string; title: string; message: string; taskId?: string };
      const notification = await api<{ id: string }>('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ type, title, message, taskId }),
      });
      return {
        content: [{ type: 'text', text: `Notification created: ${notification.id}` }],
      };
    }

    case 'get_pending_notifications': {
      const result = await api<{ count: number; messages: { text: string }[] }>('/api/notifications/pending');
      if (result.count === 0) {
        return {
          content: [{ type: 'text', text: 'No pending notifications' }],
        };
      }
      return {
        content: [{ type: 'text', text: result.messages.map(m => m.text).join('\n\n---\n\n') }],
      };
    }

    case 'check_notifications': {
      const result = await api<{ checked: number; created: number; notifications: { title: string }[] }>('/api/notifications/check', {
        method: 'POST',
      });
      let text = `Checked ${result.checked} tasks. Created ${result.created} new notifications.`;
      if (result.notifications.length > 0) {
        text += '\n\nNew notifications:\n' + result.notifications.map(n => `- ${n.title}`).join('\n');
      }
      return {
        content: [{ type: 'text', text }],
      };
    }

    default:
      throw new Error(`Unknown notification tool: ${name}`);
  }
}
