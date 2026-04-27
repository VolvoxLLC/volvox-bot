import { describe, expect, it, vi } from 'vitest';
import { extractApiError, isAbortError, safeParseJson, toErrorMessage } from '@/lib/api-utils';

describe('api utils', () => {
  it('parses JSON responses and returns null when parsing fails', async () => {
    await expect(safeParseJson({ json: vi.fn().mockResolvedValue({ ok: true }) } as unknown as Response)).resolves.toEqual({
      ok: true,
    });
    await expect(safeParseJson({ json: vi.fn().mockRejectedValue(new Error('bad json')) } as unknown as Response)).resolves.toBeNull();
  });

  it('extracts API error payloads with fallback handling', () => {
    expect(extractApiError({ error: 'Denied' }, 'Fallback')).toBe('Denied');
    expect(extractApiError({ error: 500 }, 'Fallback')).toBe('Fallback');
    expect(extractApiError(null, 'Fallback')).toBe('Fallback');
  });

  it('identifies abort errors and formats unknown errors', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('aborted'))).toBe(false);
    expect(toErrorMessage(new Error('Nope'), 'Fallback')).toBe('Nope');
    expect(toErrorMessage('Nope', 'Fallback')).toBe('Fallback');
  });
});
