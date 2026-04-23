import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleDirectoryProvider } from '@/components/layout/role-directory-context';
import { RoleSelector } from '@/components/ui/role-selector';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('RoleSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/dashboard/moderation');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the shared role cache for duplicate selectors in the same guild', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: 'role-1', name: 'Admin', color: 15_292_223 },
        { id: 'role-2', name: 'Moderator', color: 3_443_003 },
      ],
    } as Response);

    render(
      <RoleDirectoryProvider>
        <RoleSelector guildId="guild-1" selected={['role-1']} onChange={vi.fn()} />
        <RoleSelector guildId="guild-1" selected={['role-2']} onChange={vi.fn()} />
      </RoleDirectoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Moderator')).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
