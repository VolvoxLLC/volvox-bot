import { describe, expect, it, vi } from 'vitest';
import { extractApiError, isAbortError, safeParseJson, toErrorMessage } from '@/lib/api-utils';

describe('api-utils', () => {
  it('parses JSON responses safely', async () => {
    const json = vi.fn().mockResolvedValue({ ok: true });

    await expect(safeParseJson({ json } as unknown as Response)).resolves.toEqual({ ok: true });
    expect(json).toHaveBeenCalledTimes(1);
  });

  it('returns null when JSON parsing fails', async () => {
    const json = vi.fn().mockRejectedValue(new Error('invalid json'));

    await expect(safeParseJson({ json } as unknown as Response)).resolves.toBeNull();
  });

  it('extracts API error strings with fallback handling', () => {
    expect(extractApiError({ error: 'Nope' }, 'Fallback')).toBe('Nope');
    expect(extractApiError({ error: 500 }, 'Fallback')).toBe('Fallback');
    expect(extractApiError(null, 'Fallback')).toBe('Fallback');
    expect(extractApiError('bad', 'Fallback')).toBe('Fallback');
  });

  it('detects abort errors', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('AbortError'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });

  it('normalizes unknown caught values to messages', () => {
    expect(toErrorMessage(new Error('Boom'), 'Fallback')).toBe('Boom');
    expect(toErrorMessage('boom', 'Fallback')).toBe('Fallback');
  });
});
