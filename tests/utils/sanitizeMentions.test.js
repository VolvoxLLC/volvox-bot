import { describe, expect, it } from 'vitest';
import { sanitizeMentions, sanitizeMessageOptions } from '../../src/utils/sanitizeMentions.js';

const ZWS = '\u200B';

describe('sanitizeMentions', () => {
  describe('strips @everyone', () => {
    it('should escape a standalone @everyone', () => {
      expect(sanitizeMentions('@everyone')).toBe(`@${ZWS}everyone`);
    });

    it('should escape @everyone within a sentence', () => {
      expect(sanitizeMentions('Hello @everyone how are you?')).toBe(
        `Hello @${ZWS}everyone how are you?`,
      );
    });

    it('should escape multiple @everyone occurrences', () => {
      expect(sanitizeMentions('@everyone and @everyone')).toBe(
        `@${ZWS}everyone and @${ZWS}everyone`,
      );
    });
  });

  describe('strips @here', () => {
    it('should escape a standalone @here', () => {
      expect(sanitizeMentions('@here')).toBe(`@${ZWS}here`);
    });

    it('should escape @here within a sentence', () => {
      expect(sanitizeMentions('Hey @here check this out')).toBe(`Hey @${ZWS}here check this out`);
    });

    it('should escape multiple @here occurrences', () => {
      expect(sanitizeMentions('@here and @here')).toBe(`@${ZWS}here and @${ZWS}here`);
    });
  });

  describe('handles mixed mentions', () => {
    it('should escape both @everyone and @here in the same message', () => {
      expect(sanitizeMentions('@everyone and @here')).toBe(`@${ZWS}everyone and @${ZWS}here`);
    });

    it('should escape mentions alongside normal user mentions', () => {
      const input = '<@123456789> said @everyone should join';
      const expected = `<@123456789> said @${ZWS}everyone should join`;
      expect(sanitizeMentions(input)).toBe(expected);
    });
  });

  describe('preserves normal content', () => {
    it('should not modify normal text', () => {
      expect(sanitizeMentions('Hello world')).toBe('Hello world');
    });

    it('should not modify user mentions', () => {
      expect(sanitizeMentions('<@123456789>')).toBe('<@123456789>');
    });

    it('should not modify role mentions', () => {
      expect(sanitizeMentions('<@&987654321>')).toBe('<@&987654321>');
    });

    it('should not modify channel mentions', () => {
      expect(sanitizeMentions('<#123456789>')).toBe('<#123456789>');
    });

    it('should not modify empty string', () => {
      expect(sanitizeMentions('')).toBe('');
    });

    it('should not modify email-like text', () => {
      expect(sanitizeMentions('user@example.com')).toBe('user@example.com');
    });

    it('should not modify email addresses containing @everyone', () => {
      expect(sanitizeMentions('user@everyone.com')).toBe('user@everyone.com');
    });

    it('should not modify email addresses containing @here', () => {
      expect(sanitizeMentions('admin@here.org')).toBe('admin@here.org');
    });
  });

  describe('handles non-string input', () => {
    it('should return null unchanged', () => {
      expect(sanitizeMentions(null)).toBe(null);
    });

    it('should return undefined unchanged', () => {
      expect(sanitizeMentions(undefined)).toBe(undefined);
    });

    it('should return numbers unchanged', () => {
      expect(sanitizeMentions(42)).toBe(42);
    });

    it('should return booleans unchanged', () => {
      expect(sanitizeMentions(true)).toBe(true);
    });

    it('should return objects unchanged', () => {
      const obj = { foo: 'bar' };
      expect(sanitizeMentions(obj)).toBe(obj);
    });
  });
});

describe('sanitizeMessageOptions', () => {
  it('should sanitize a string argument', () => {
    expect(sanitizeMessageOptions('@everyone hello')).toBe(`@${ZWS}everyone hello`);
  });

  it('should sanitize content in an options object', () => {
    const result = sanitizeMessageOptions({ content: '@here world', ephemeral: true });
    expect(result).toEqual({ content: `@${ZWS}here world`, ephemeral: true });
  });

  it('should not modify options without content', () => {
    const options = { embeds: [{ title: 'test' }] };
    expect(sanitizeMessageOptions(options)).toEqual(options);
  });

  it('should handle null content in options', () => {
    const result = sanitizeMessageOptions({ content: null, ephemeral: true });
    expect(result).toEqual({ content: null, ephemeral: true });
  });

  it('should return null unchanged', () => {
    expect(sanitizeMessageOptions(null)).toBe(null);
  });

  it('should return undefined unchanged', () => {
    expect(sanitizeMessageOptions(undefined)).toBe(undefined);
  });

  it('should return numbers unchanged', () => {
    expect(sanitizeMessageOptions(42)).toBe(42);
  });

  it('should not mutate the original options object', () => {
    const original = { content: '@everyone', ephemeral: true };
    const result = sanitizeMessageOptions(original);
    expect(original.content).toBe('@everyone');
    expect(result.content).toBe(`@${ZWS}everyone`);
  });
});

describe('sanitizeMentions edge cases', () => {
  describe('email address false positives', () => {
    it('should not mutate user@everyone.com', () => {
      expect(sanitizeMentions('Contact user@everyone.com for help')).toBe(
        'Contact user@everyone.com for help',
      );
    });

    it('should not mutate admin@here.org', () => {
      expect(sanitizeMentions('Email admin@here.org')).toBe('Email admin@here.org');
    });

    it('should still escape standalone @everyone alongside an email', () => {
      expect(sanitizeMentions('user@everyone.com said @everyone look')).toBe(
        `user@everyone.com said @${ZWS}everyone look`,
      );
    });
  });

  describe('mentions inside code blocks', () => {
    it('should escape @everyone inside inline code (no markdown awareness)', () => {
      // sanitizeMentions operates on raw text — it doesn't parse markdown.
      // Code blocks are rendered by Discord, not by our sanitizer.
      expect(sanitizeMentions('`@everyone`')).toBe(`\`@${ZWS}everyone\``);
    });

    it('should escape @here inside a fenced code block', () => {
      const input = '```\n@here\n```';
      expect(sanitizeMentions(input)).toBe(`\`\`\`\n@${ZWS}here\n\`\`\``);
    });
  });

  describe('double-sanitization idempotency', () => {
    it('should be idempotent — sanitizing twice produces the same result', () => {
      const once = sanitizeMentions('@everyone and @here');
      const twice = sanitizeMentions(once);
      expect(twice).toBe(once);
    });

    it('should be idempotent for sanitizeMessageOptions', () => {
      const once = sanitizeMessageOptions({ content: '@everyone test' });
      const twice = sanitizeMessageOptions(once);
      expect(twice).toEqual(once);
    });
  });

  describe('multiple consecutive mentions', () => {
    it('should escape back-to-back @everyone @here', () => {
      expect(sanitizeMentions('@everyone @here')).toBe(`@${ZWS}everyone @${ZWS}here`);
    });

    it('should escape three consecutive @everyone mentions', () => {
      expect(sanitizeMentions('@everyone @everyone @everyone')).toBe(
        `@${ZWS}everyone @${ZWS}everyone @${ZWS}everyone`,
      );
    });

    it('should escape mentions on separate lines', () => {
      expect(sanitizeMentions('@everyone\n@here\n@everyone')).toBe(
        `@${ZWS}everyone\n@${ZWS}here\n@${ZWS}everyone`,
      );
    });
  });
});
