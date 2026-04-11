import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/layout/sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar-content">Sidebar</div>,
}));

import { MobileSidebar } from '@/components/layout/mobile-sidebar';

describe('MobileSidebar', () => {
  it('provides an accessible sheet description when opened', async () => {
    const user = userEvent.setup();

    render(<MobileSidebar />);

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(
      screen.getByText(
        'Browse dashboard navigation and switch workspaces from the control room sidebar.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-content')).toBeInTheDocument();
  });
});
