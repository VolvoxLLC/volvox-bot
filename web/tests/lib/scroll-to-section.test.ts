import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollToLandingSection } from '@/lib/scroll-to-section';

describe('scroll-to-section', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('returns false when the target cannot be found', () => {
    expect(scrollToLandingSection('missing')).toBe(false);
  });

  it('scrolls to nested scroll content with desktop offset', () => {
    const section = document.createElement('section');
    section.id = 'features';
    const content = document.createElement('div');
    content.setAttribute('data-scroll-content', '');
    section.append(content);
    document.body.append(section);

    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({ top: 250 } as DOMRect);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(50);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);

    expect(scrollToLandingSection('#features')).toBe(true);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 220, behavior: 'smooth' });
  });

  it('uses mobile offset and reduced-motion behavior for direct elements', () => {
    const element = document.createElement('section');
    document.body.append(element);

    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top: 200 } as DOMRect);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(20);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

    expect(scrollToLandingSection(element)).toBe(true);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 148, behavior: 'auto' });
  });
});
