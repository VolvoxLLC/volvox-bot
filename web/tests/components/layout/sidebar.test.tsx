import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));
vi.mock("@/hooks/use-guild-selection", () => ({
  useGuildSelection: () => "guild-1",
}));

import { Sidebar } from '@/components/layout/sidebar';

describe('Sidebar', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders navigation links', () => {
    render(<Sidebar />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Moderation')).toBeInTheDocument();
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Bot Config')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('highlights the active route and marks it as the current page', () => {
    render(<Sidebar />);
    const overviewLink = screen.getByText('Overview').closest('a');
    expect(overviewLink).not.toBeNull();
    expect(overviewLink?.className).toContain('sidebar-item-active');
    expect(overviewLink).toHaveAttribute('aria-current', 'page');
  });

  it('calls onNavClick when a link is clicked', async () => {
    const user = userEvent.setup();
    const onNavClick = vi.fn();
    render(<Sidebar onNavClick={onNavClick} />);
    await user.click(screen.getByText('Moderation'));
    expect(onNavClick).toHaveBeenCalled();
  });

  it('hides non-moderation pages for moderator-only guild access', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'guild-1',
          name: 'Guild One',
          icon: null,
          owner: false,
          permissions: '0',
          access: 'moderator',
          features: [],
          botPresent: true,
        },
      ],
    } as Response);

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Moderation')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(screen.queryByText('Bot Config')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Chat')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });
});
