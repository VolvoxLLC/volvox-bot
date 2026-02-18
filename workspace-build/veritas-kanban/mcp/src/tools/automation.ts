import { z } from 'zod';
import { api } from '../utils/api.js';
import { findTask } from '../utils/find.js';
import { Task } from '../utils/types.js';

const StartAutomationSchema = z.object({
  id: z.string().min(1),
  sessionKey: z.string().optional(),
});

const CompleteAutomationSchema = z.object({
  id: z.string().min(1),
  result: z.string().optional(),
  failed: z.boolean().default(false),
});

export const automationTools = [
  {
    name: 'list_pending_automation',
    description: 'List automation tasks waiting to be executed by Veritas',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_running_automation',
    description: 'List automation tasks currently being executed',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'start_automation',
    description: 'Start an automation task via Veritas sub-agent',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID or partial ID',
        },
        sessionKey: {
          type: 'string',
          description: 'Clawdbot session key (optional)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'complete_automation',
    description: 'Mark an automation task as complete or failed',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID or partial ID',
        },
        result: {
          type: 'string',
          description: 'Result summary',
        },
        failed: {
          type: 'boolean',
          description: 'Mark as failed instead of complete',
        },
      },
      required: ['id'],
    },
  },
];

export async function handleAutomationTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'list_pending_automation': {
      const tasks = await api<Task[]>('/api/automation/pending');
      return {
        content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }],
      };
    }

    case 'list_running_automation': {
      const tasks = await api<Task[]>('/api/automation/running');
      return {
        content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }],
      };
    }

    case 'start_automation': {
      const { id, sessionKey } = StartAutomationSchema.parse(args);
      const task = await findTask(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: `Task not found: ${id}` }],
          isError: true,
        };
      }

      const result = await api<{ taskId: string; attemptId: string; title: string; description: string }>(
        `/api/automation/${task.id}/start`,
        {
          method: 'POST',
          body: JSON.stringify({ sessionKey }),
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: `Automation started\nTask: ${result.title}\nAttempt: ${result.attemptId}\n\nDescription:\n${result.description}`,
          },
        ],
      };
    }

    case 'complete_automation': {
      const { id, result, failed } = CompleteAutomationSchema.parse(args);
      const task = await findTask(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: `Task not found: ${id}` }],
          isError: true,
        };
      }

      const response = await api<{ taskId: string; status: string }>(
        `/api/automation/${task.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ result, status: failed ? 'failed' : 'complete' }),
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: `Automation ${response.status === 'complete' ? 'completed' : 'marked as failed'}: ${task.id}`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown automation tool: ${name}`);
  }
}
