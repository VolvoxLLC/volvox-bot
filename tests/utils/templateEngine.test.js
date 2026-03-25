import { describe, expect, it } from 'vitest';

import { renderTemplate, validateLength } from '../../src/utils/templateEngine.js';

describe('renderTemplate', () => {
  it('should replace known variables with their values', () => {
    const result = renderTemplate('Hello {{username}}!', { username: 'Alice' });
    expect(result).toBe('Hello Alice!');
  });

  it('should replace multiple variables in the same template', () => {
    const result = renderTemplate('{{mention}} reached Level {{level}}!', {
      mention: '<@123>',
      level: '5',
    });
    expect(result).toBe('<@123> reached Level 5!');
  });

  it('should replace adjacent variables without space', () => {
    const result = renderTemplate('{{username}}{{level}}', {
      username: 'Bob',
      level: '10',
    });
    expect(result).toBe('Bob10');
  });

  it('should replace null/undefined values with empty string', () => {
    const result = renderTemplate('Role: {{roleName}}', { roleName: null });
    expect(result).toBe('Role: ');
  });

  it('should replace undefined context values with empty string', () => {
    const result = renderTemplate('Role: {{roleName}}', { roleName: undefined });
    expect(result).toBe('Role: ');
  });

  it('should leave unknown tokens as-is', () => {
    const result = renderTemplate('Hello {{unknownVar}}!', { username: 'Alice' });
    expect(result).toBe('Hello {{unknownVar}}!');
  });

  it('should return empty string for empty template', () => {
    const result = renderTemplate('', { username: 'Alice' });
    expect(result).toBe('');
  });

  it('should return template as-is when context is empty', () => {
    const result = renderTemplate('No vars here', {});
    expect(result).toBe('No vars here');
  });

  it('should handle template with only a variable', () => {
    const result = renderTemplate('{{username}}', { username: 'Alice' });
    expect(result).toBe('Alice');
  });

  it('should not replace partial matches like {username} or {{username', () => {
    const result = renderTemplate('{username} and {{username', { username: 'Alice' });
    expect(result).toBe('{username} and {{username');
  });
});

describe('validateLength', () => {
  it('should return valid for text under limit', () => {
    const result = validateLength('hello', 2000);
    expect(result).toEqual({ valid: true, length: 5, limit: 2000 });
  });

  it('should return valid for text at exact limit', () => {
    const text = 'a'.repeat(2000);
    const result = validateLength(text, 2000);
    expect(result).toEqual({ valid: true, length: 2000, limit: 2000 });
  });

  it('should return invalid for text over limit', () => {
    const text = 'a'.repeat(2001);
    const result = validateLength(text, 2000);
    expect(result).toEqual({ valid: false, length: 2001, limit: 2000 });
  });

  it('should return valid for empty string', () => {
    const result = validateLength('', 100);
    expect(result).toEqual({ valid: true, length: 0, limit: 100 });
  });
});
