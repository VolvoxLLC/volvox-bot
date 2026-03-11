import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_TITLE } from '@/lib/page-titles';

let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { DashboardTitleSync } from '@/components/layout/dashboard-title-sync';

describe('DashboardTitleSync', () => {
  beforeEach(() => {
    mockPathname = '/dashboard';
    document.title = '';
  });

  it('sets the dashboard title from the current route', async () => {
    mockPathname = '/dashboard/members';

    render(<DashboardTitleSync />);

    await waitFor(() => {
      expect(document.title).toBe('Members - Volvox.Bot - AI Powered Discord Bot');
    });
  });

  it('updates the title when the route changes', async () => {
    const { rerender } = render(<DashboardTitleSync />);

    await waitFor(() => {
      expect(document.title).toBe('Overview - Volvox.Bot - AI Powered Discord Bot');
    });

    mockPathname = '/dashboard/tickets/42';
    rerender(<DashboardTitleSync />);

    await waitFor(() => {
      expect(document.title).toBe('Ticket Details - Volvox.Bot - AI Powered Discord Bot');
    });
  });

  it('falls back to the app title for unknown routes', async () => {
    mockPathname = '/dashboard/something-weird';

    render(<DashboardTitleSync />);

    await waitFor(() => {
      expect(document.title).toBe(APP_TITLE);
    });
  });

  it('does not leave a stale metadata title stuck on the next client-only route', async () => {
    document.title = 'Custom Members - Volvox.Bot - AI Powered Discord Bot';
    mockPathname = '/dashboard/members';

    const { rerender } = render(<DashboardTitleSync />);

    await waitFor(() => {
      expect(document.title).toBe('Custom Members - Volvox.Bot - AI Powered Discord Bot');
    });

    mockPathname = '/dashboard/config';
    rerender(<DashboardTitleSync />);

    await waitFor(() => {
      expect(document.title).toBe('Bot Config - Volvox.Bot - AI Powered Discord Bot');
    });
  });
});
