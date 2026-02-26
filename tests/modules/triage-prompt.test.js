import { describe, expect, it, vi } from 'vitest';
import {
  buildClassifyPrompt,
  buildConversationText,
  buildRespondPrompt,
} from '../../src/modules/triage-prompt.js';

// Mock the prompt loader
vi.mock('../../src/prompts/index.js', () => ({
  loadPrompt: vi.fn((name, vars) => {
    if (name === 'community-rules') return 'Community rules content';
    if (name === 'anti-abuse') return 'Anti-abuse guidelines';
    if (name === 'search-guardrails') return 'Search guardrails content';

    if (name === 'triage-classify') {
      return `Classify prompt with:\nConversation: ${vars.conversationText}\nRules: ${vars.communityRules}\nBot: ${vars.botUserId}`;
    }

    if (name === 'triage-respond') {
      return `Respond prompt with:\nSystem: ${vars.systemPrompt}\nRules: ${vars.communityRules}\nConversation: ${vars.conversationText}\nClassification: ${vars.classification}\nReasoning: ${vars.reasoning}\nTargets: ${vars.targetMessageIds}\nMemory: ${vars.memoryContext}\nAntiAbuse: ${vars.antiAbuse}\nSearch: ${vars.searchGuardrails}`;
    }

    return `Prompt ${name}`;
  }),
}));

describe('triage-prompt', () => {
  describe('buildConversationText', () => {
    it('should format messages with IDs and usernames', () => {
      const context = [];
      const buffer = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Hello world',
        },
        {
          messageId: 'msg2',
          author: 'Bob',
          userId: 'user2',
          content: 'Hi there',
        },
      ];

      const result = buildConversationText(context, buffer);

      expect(result).toContain('<messages-to-evaluate>');
      expect(result).toContain('[msg1] Alice (<@user1>): Hello world');
      expect(result).toContain('[msg2] Bob (<@user2>): Hi there');
      expect(result).toContain('</messages-to-evaluate>');
    });

    it('should include recent history section when context is provided', () => {
      const context = [
        {
          messageId: 'ctx1',
          author: 'Charlie',
          userId: 'user3',
          content: 'Context message',
        },
      ];
      const buffer = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'New message',
        },
      ];

      const result = buildConversationText(context, buffer);

      expect(result).toContain('<recent-history>');
      expect(result).toContain('[ctx1] Charlie (<@user3>): Context message');
      expect(result).toContain('</recent-history>');
      expect(result).toContain('<messages-to-evaluate>');
    });

    it('should format timestamps when available', () => {
      const context = [];
      const buffer = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Hello',
          timestamp: 1704067200000, // 2024-01-01 00:00:00 UTC
        },
      ];

      const result = buildConversationText(context, buffer);

      expect(result).toContain('[00:00:00] [msg1]');
    });

    it('should include reply context when message is a reply', () => {
      const context = [];
      const buffer = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Original message',
        },
        {
          messageId: 'msg2',
          author: 'Bob',
          userId: 'user2',
          content: 'Reply message',
          replyTo: {
            author: 'Alice',
            content: 'Original message',
          },
        },
      ];

      const result = buildConversationText(context, buffer);

      expect(result).toContain('(replying to Alice: "Original message")');
    });

    it('should truncate long reply content to 100 chars', () => {
      const context = [];
      const buffer = [
        {
          messageId: 'msg1',
          author: 'Bob',
          userId: 'user2',
          content: 'Reply',
          replyTo: {
            author: 'Alice',
            content: 'a'.repeat(150),
          },
        },
      ];

      const result = buildConversationText(context, buffer);

      expect(result).toContain(`(replying to Alice: "${'a'.repeat(100)}")`);
      expect(result).not.toContain('a'.repeat(150));
    });

    it('should handle empty context and buffer', () => {
      const result = buildConversationText([], []);

      expect(result).toContain('<messages-to-evaluate>');
      expect(result).toContain('</messages-to-evaluate>');
      expect(result).not.toContain('<recent-history>');
    });

    it('should handle messages without timestamps', () => {
      const context = [];
      const buffer = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Message without timestamp',
        },
      ];

      const result = buildConversationText(context, buffer);

      expect(result).toContain('[msg1] Alice (<@user1>): Message without timestamp');
      expect(result).not.toContain('[00:00:00]');
    });
  });

  describe('buildClassifyPrompt', () => {
    it('should build classifier prompt with conversation and rules', () => {
      const context = [];
      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Test message',
        },
      ];
      const botUserId = 'bot123';

      const result = buildClassifyPrompt(context, snapshot, botUserId);

      expect(result).toContain('Classify prompt with:');
      expect(result).toContain('Conversation:');
      expect(result).toContain('[msg1] Alice (<@user1>): Test message');
      expect(result).toContain('Rules: Community rules content');
      expect(result).toContain('Bot: bot123');
    });

    it('should use "unknown" when botUserId is not provided', () => {
      const context = [];
      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Test',
        },
      ];

      const result = buildClassifyPrompt(context, snapshot);

      expect(result).toContain('Bot: unknown');
    });

    it('should include context messages in prompt', () => {
      const context = [
        {
          messageId: 'ctx1',
          author: 'Bob',
          userId: 'user2',
          content: 'Context',
        },
      ];
      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'New',
        },
      ];

      const result = buildClassifyPrompt(context, snapshot, 'bot123');

      expect(result).toContain('<recent-history>');
      expect(result).toContain('[ctx1] Bob (<@user2>): Context');
    });
  });

  describe('buildRespondPrompt', () => {
    it('should build responder prompt with all components', () => {
      const context = [];
      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Question',
        },
      ];
      const classification = {
        classification: 'respond',
        reasoning: 'User asked a question',
        targetMessageIds: ['msg1'],
      };
      const config = {
        ai: {
          systemPrompt: 'You are helpful',
        },
      };
      const memoryContext = 'User likes cats';

      const result = buildRespondPrompt(context, snapshot, classification, config, memoryContext);

      expect(result).toContain('System: You are helpful');
      expect(result).toContain('Rules: Community rules content');
      expect(result).toContain('Classification: respond');
      expect(result).toContain('Reasoning: User asked a question');
      expect(result).toContain('Targets: ["msg1"]');
      expect(result).toContain('Memory: User likes cats');
      expect(result).toContain('AntiAbuse: Anti-abuse guidelines');
      expect(result).toContain('Search: Search guardrails content');
    });

    it('should use default system prompt when config is missing', () => {
      const context = [];
      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Question',
        },
      ];
      const classification = {
        classification: 'respond',
        reasoning: 'Test',
        targetMessageIds: [],
      };
      const config = {};

      const result = buildRespondPrompt(context, snapshot, classification, config);

      expect(result).toContain('System: You are a helpful Discord bot.');
    });

    it('should handle empty memory context', () => {
      const context = [];
      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Question',
        },
      ];
      const classification = {
        classification: 'respond',
        reasoning: 'Test',
        targetMessageIds: [],
      };
      const config = {
        ai: {
          systemPrompt: 'Be helpful',
        },
      };

      const result = buildRespondPrompt(context, snapshot, classification, config, '');

      expect(result).toContain('Memory: ');
    });

    it('should include context messages', () => {
      const context = [
        {
          messageId: 'ctx1',
          author: 'Bob',
          userId: 'user2',
          content: 'Earlier',
        },
      ];
      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'Now',
        },
      ];
      const classification = {
        classification: 'respond',
        reasoning: 'Test',
        targetMessageIds: [],
      };
      const config = {};

      const result = buildRespondPrompt(context, snapshot, classification, config);

      expect(result).toContain('<recent-history>');
      expect(result).toContain('[ctx1] Bob (<@user2>): Earlier');
    });

    it('should stringify targetMessageIds array', () => {
      const context = [];
      const snapshot = [
        {
          messageId: 'msg1',
          author: 'Alice',
          userId: 'user1',
          content: 'First',
        },
        {
          messageId: 'msg2',
          author: 'Bob',
          userId: 'user2',
          content: 'Second',
        },
      ];
      const classification = {
        classification: 'respond',
        reasoning: 'Multiple targets',
        targetMessageIds: ['msg1', 'msg2'],
      };
      const config = {};

      const result = buildRespondPrompt(context, snapshot, classification, config);

      expect(result).toContain('Targets: ["msg1","msg2"]');
    });
  });
});
