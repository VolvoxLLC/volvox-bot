// WebSocket Message Types

import type { AttemptStatus } from './task.types.js';
import type { ChatMessage } from './chat.types.js';

export type WSMessageType =
  | 'agent:output'
  | 'agent:status'
  | 'agent:complete'
  | 'task:updated'
  | 'chat:message'
  | 'chat:subscribed'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  taskId?: string;
  attemptId?: string;
  data: unknown;
  timestamp: string;
}

export interface AgentOutputMessage extends WSMessage {
  type: 'agent:output';
  data: {
    stream: 'stdout' | 'stderr';
    content: string;
  };
}

export interface AgentStatusMessage extends WSMessage {
  type: 'agent:status';
  data: {
    status: AttemptStatus;
    exitCode?: number;
  };
}

export interface ChatMessageEvent extends WSMessage {
  type: 'chat:message';
  data: {
    sessionId: string;
    message: ChatMessage;
  };
}
