import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollToLandingSection } from '@/lib/scroll-to-section';

describe('scrollToLandingSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('scrolls to an element by id', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 25 });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);

    const section = document.createElement('section');
    section.id = 'features';
    section.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 300,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: vi.fn(),
    }));
    document.body.append(section);

    expect(scrollToLandingSection('#features')).toBe(true);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 245, behavior: 'smooth' });
  });

  it('uses nested scroll content and reduced-motion behavior', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 10 });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

    const section = document.createElement('section');
    const content = document.createElement('div');
    content.dataset.scrollContent = '';
    content.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 200,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: vi.fn(),
    }));
    section.append(content);

    expect(scrollToLandingSection(section)).toBe(true);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 138, behavior: 'auto' });
  });

  it('returns false when the target does not exist', () => {
    expect(scrollToLandingSection('missing')).toBe(false);
  });
});
