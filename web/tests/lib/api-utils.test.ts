import { describe, expect, it, vi } from 'vitest';
import { extractApiError, isAbortError, safeParseJson, toErrorMessage } from '@/lib/api-utils';

describe('api-utils', () => {
  it('parses response JSON and returns null on parse failures', async () => {
    await expect(safeParseJson(new Response(JSON.stringify({ ok: true })))).resolves.toEqual({
      ok: true,
    });

    await expect(
      safeParseJson({ json: vi.fn().mockRejectedValue(new SyntaxError('bad json')) } as unknown as Response),
    ).resolves.toBeNull();
  });

  it('extracts API error strings with a fallback', () => {
    expect(extractApiError({ error: 'Nope' }, 'Fallback')).toBe('Nope');
    expect(extractApiError({ error: 42 }, 'Fallback')).toBe('Fallback');
    expect(extractApiError(null, 'Fallback')).toBe('Fallback');
  });

  it('detects abort errors and formats unknown errors', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('Aborted'))).toBe(false);
    expect(toErrorMessage(new Error('Boom'), 'Fallback')).toBe('Boom');
    expect(toErrorMessage('boom', 'Fallback')).toBe('Fallback');
  });
});
