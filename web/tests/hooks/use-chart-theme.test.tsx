import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// We control resolvedTheme per test
let mockResolvedTheme: string | undefined = undefined;

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme }),
}));

import { useChartTheme } from '@/hooks/use-chart-theme';

describe('useChartTheme', () => {
  beforeEach(() => {
    mockResolvedTheme = undefined;
  });

  it('returns light palette by default (before mount)', () => {
    mockResolvedTheme = 'light';
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.primary).toBe('#5865F2');
  });

  it('returns light palette when theme is light after mount', async () => {
    mockResolvedTheme = 'light';
    const { result } = renderHook(() => useChartTheme());
    await act(async () => {});
    expect(result.current.primary).toBe('#5865F2');
    expect(result.current.success).toBe('#16A34A');
    expect(result.current.grid).toBe('#E5E7EB');
    expect(result.current.palette).toHaveLength(5);
  });

  it('returns dark palette when theme is dark after mount', async () => {
    mockResolvedTheme = 'dark';
    const { result } = renderHook(() => useChartTheme());
    await act(async () => {});
    expect(result.current.primary).toBe('#818CF8');
    expect(result.current.success).toBe('#4ADE80');
    expect(result.current.grid).toBe('#374151');
    expect(result.current.palette).toHaveLength(5);
  });

  it('returns light palette when resolvedTheme is undefined after mount', async () => {
    mockResolvedTheme = undefined;
    const { result } = renderHook(() => useChartTheme());
    await act(async () => {});
    expect(result.current.primary).toBe('#5865F2');
  });

  it('palette has 5 hex colors in light mode', async () => {
    mockResolvedTheme = 'light';
    const { result } = renderHook(() => useChartTheme());
    await act(async () => {});
    expect(result.current.palette).toHaveLength(5);
    for (const color of result.current.palette) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('palette has 5 hex colors in dark mode', async () => {
    mockResolvedTheme = 'dark';
    const { result } = renderHook(() => useChartTheme());
    await act(async () => {});
    expect(result.current.palette).toHaveLength(5);
    for (const color of result.current.palette) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('light and dark themes have different primary colors', async () => {
    mockResolvedTheme = 'light';
    const { result: lightResult } = renderHook(() => useChartTheme());
    await act(async () => {});

    mockResolvedTheme = 'dark';
    const { result: darkResult } = renderHook(() => useChartTheme());
    await act(async () => {});

    expect(lightResult.current.primary).not.toBe(darkResult.current.primary);
    expect(lightResult.current.grid).not.toBe(darkResult.current.grid);
  });

  it('exposes tooltip theme colors', async () => {
    mockResolvedTheme = 'dark';
    const { result } = renderHook(() => useChartTheme());
    await act(async () => {});
    expect(result.current.tooltipBg).toBeDefined();
    expect(result.current.tooltipBorder).toBeDefined();
    expect(result.current.tooltipText).toBeDefined();
  });
});
