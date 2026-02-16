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
      // @everyone/@here only match at word boundary, but email addresses
      // don't typically contain "everyone" or "here" after @
      expect(sanitizeMentions('user@example.com')).toBe('user@example.com');
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
