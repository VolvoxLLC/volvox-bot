import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetBotInviteUrl } = vi.hoisted(() => ({
  mockGetBotInviteUrl: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(({ animate: _animate, initial: _initial, transition: _transition, whileHover: _whileHover, whileInView: _whileInView, whileTap: _whileTap, viewport: _viewport, ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, props.children)
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: createComponent('div'),
      h1: createComponent('h1'),
      h2: createComponent('h2'),
      li: createComponent('li'),
      p: createComponent('p'),
      span: createComponent('span'),
      section: createComponent('section'),
    },
    useInView: () => true,
    useScroll: () => ({ scrollY: 0, scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
    useReducedMotion: () => false,
  };
});

// Mock GSAP — Footer uses useGSAP/ScrollTrigger
vi.mock('gsap', () => ({
  gsap: { registerPlugin: vi.fn(), fromTo: vi.fn(), to: vi.fn() },
  default: { registerPlugin: vi.fn(), fromTo: vi.fn(), to: vi.fn() },
}));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }));
vi.mock('@gsap/react', () => ({ useGSAP: vi.fn() }));

vi.mock('@/lib/discord', () => ({
  getBotInviteUrl: () => mockGetBotInviteUrl(),
}));

// next/image mock
vi.mock('next/image', () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}));

import { Footer } from '@/components/landing/Footer';

describe('Footer', () => {
  beforeEach(() => {
    mockGetBotInviteUrl.mockReturnValue('https://discord.com/invite/bot');
  });

  it('should render the main CTA heading', () => {
    render(<Footer />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('should render the invite link when URL is available', () => {
    render(<Footer />);
    const link = screen.getByRole('link', { name: /Initialize Bot/i });
    expect(link).toHaveAttribute('href', 'https://discord.com/invite/bot');
  });

  it('should render locked state when no invite URL', () => {
    mockGetBotInviteUrl.mockReturnValue(null);
    render(<Footer />);
    expect(screen.getByText(/OVERSIGHT_LOCKED/i)).toBeInTheDocument();
  });

  it('should render footer navigation links', () => {
    render(<Footer />);
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(screen.getByText('Source Code')).toBeInTheDocument();
    expect(screen.getByText('Support Node')).toBeInTheDocument();
  });

  it('should render the brand tagline and logo', () => {
    render(<Footer />);
    expect(screen.getByText(/synthesis of artificial intelligence/i)).toBeInTheDocument();
    expect(screen.getByAltText('Volvox')).toBeInTheDocument();
  });
});
