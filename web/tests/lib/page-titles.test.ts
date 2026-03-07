import { describe, expect, it } from 'vitest';
import {
  APP_TITLE,
  createPageMetadata,
  formatDocumentTitle,
  getDashboardDocumentTitle,
  getDashboardPageTitle,
} from '@/lib/page-titles';

describe('page titles', () => {
  it('formats dashboard tab titles with the shared app title suffix', () => {
    expect(formatDocumentTitle('Members')).toBe('Members - Volvox.Bot - AI Powered Discord Bot');
  });

  it('maps dashboard routes to the expected tab titles', () => {
    expect(getDashboardPageTitle('/dashboard')).toBe('Overview');
    expect(getDashboardPageTitle('/dashboard/members')).toBe('Members');
    expect(getDashboardPageTitle('/dashboard/members/123')).toBe('Member Details');
    expect(getDashboardPageTitle('/dashboard/conversations/abc')).toBe('Conversation Details');
    expect(getDashboardPageTitle('/dashboard/tickets/42')).toBe('Ticket Details');
    expect(getDashboardPageTitle('/dashboard/unknown')).toBeNull();
  });

  it('builds complete document titles from dashboard routes', () => {
    expect(getDashboardDocumentTitle('/dashboard/audit-log')).toBe(
      'Audit Log - Volvox.Bot - AI Powered Discord Bot',
    );
    expect(getDashboardDocumentTitle('/dashboard/unknown')).toBe(APP_TITLE);
  });

  it('creates Next metadata objects with optional descriptions', () => {
    expect(createPageMetadata('Performance')).toEqual({ title: 'Performance' });
    expect(createPageMetadata('Bot Config', 'Manage settings')).toEqual({
      title: 'Bot Config',
      description: 'Manage settings',
    });
  });
});
