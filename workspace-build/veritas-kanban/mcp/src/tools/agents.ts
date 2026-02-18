import { z } from 'zod';
import { api } from '../utils/api.js';
import { findTask } from '../utils/find.js';

const StartAgentSchema = z.object({
  id: z.string().min(1),
  agent: z.enum(['claude-code', 'amp', 'copilot', 'gemini', 'veritas']).default('claude-code'),
});

const TaskIdSchema = z.object({
  id: z.string().min(1),
});

export const agentTools = [
  {
    name: 'start_agent',
    description: 'Start an AI coding agent on a code task (requires worktree)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID or partial ID',
        },
        agent: {
          type: 'string',
          enum: ['claude-code', 'amp', 'copilot', 'gemini'],
          description: 'Agent to use (default: claude-code)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'stop_agent',
    description: 'Stop a running agent on a task',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Task ID or partial ID',
        },
      },
      required: ['id'],
    },
  },
];

export async function handleAgentTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'start_agent': {
      const { id, agent } = StartAgentSchema.parse(args);
      const task = await findTask(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: `Task not found: ${id}` }],
          isError: true,
        };
      }

      if (task.type !== 'code') {
        return {
          content: [{ type: 'text', text: 'Can only start agents on code tasks' }],
          isError: true,
        };
      }

      if (!task.git?.worktreePath) {
        return {
          content: [{ type: 'text', text: 'Task needs a worktree first' }],
          isError: true,
        };
      }

      const result = await api<{ attemptId: string }>(`/api/agents/${task.id}/start`, {
        method: 'POST',
        body: JSON.stringify({ agent }),
      });

      return {
        content: [
          {
            type: 'text',
            text: `Agent started: ${agent}\nAttempt ID: ${result.attemptId}\nWorking in: ${task.git.worktreePath}`,
          },
        ],
      };
    }

    case 'stop_agent': {
      const { id } = TaskIdSchema.parse(args);
      const task = await findTask(id);

      if (!task) {
        return {
          content: [{ type: 'text', text: `Task not found: ${id}` }],
          isError: true,
        };
      }

      await api(`/api/agents/${task.id}/stop`, { method: 'POST' });

      return {
        content: [{ type: 'text', text: 'Agent stopped' }],
      };
    }

    default:
      throw new Error(`Unknown agent tool: ${name}`);
  }
}
