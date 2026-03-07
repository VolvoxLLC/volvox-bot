import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_ROLE_ORDER,
  getDashboardRole,
  hasMinimumRole,
} from '../../../src/api/utils/dashboardRoles.js';

describe('dashboardRoles', () => {
  describe('getDashboardRole', () => {
    it('returns owner when owner flag is true', () => {
      expect(getDashboardRole(0, true)).toBe('owner');
      expect(getDashboardRole(0x8, true)).toBe('owner');
    });

    it('returns admin for ADMINISTRATOR permission (0x8)', () => {
      expect(getDashboardRole(0x8, false)).toBe('admin');
    });

    it('returns admin for MANAGE_GUILD permission (0x20)', () => {
      expect(getDashboardRole(0x20, false)).toBe('admin');
    });

    it('returns moderator for MANAGE_MESSAGES (0x2000)', () => {
      expect(getDashboardRole(0x2000, false)).toBe('moderator');
    });

    it('returns moderator for KICK_MEMBERS (0x2)', () => {
      expect(getDashboardRole(0x2, false)).toBe('moderator');
    });

    it('returns moderator for BAN_MEMBERS (0x4)', () => {
      expect(getDashboardRole(0x4, false)).toBe('moderator');
    });

    it('returns viewer for VIEW_CHANNEL (0x400)', () => {
      expect(getDashboardRole(0x400, false)).toBe('viewer');
    });

    it('returns viewer for zero or no special permissions', () => {
      expect(getDashboardRole(0, false)).toBe('viewer');
      expect(getDashboardRole(NaN, false)).toBe('viewer');
    });

    it('accepts string permissions', () => {
      expect(getDashboardRole('8', false)).toBe('admin');
      expect(getDashboardRole('32', false)).toBe('admin');
      expect(getDashboardRole('8192', false)).toBe('moderator');
    });
  });

  describe('hasMinimumRole', () => {
    it('returns true when user role equals required', () => {
      expect(hasMinimumRole('viewer', 'viewer')).toBe(true);
      expect(hasMinimumRole('moderator', 'moderator')).toBe(true);
      expect(hasMinimumRole('admin', 'admin')).toBe(true);
      expect(hasMinimumRole('owner', 'owner')).toBe(true);
    });

    it('returns true when user role is higher than required', () => {
      expect(hasMinimumRole('owner', 'viewer')).toBe(true);
      expect(hasMinimumRole('owner', 'admin')).toBe(true);
      expect(hasMinimumRole('admin', 'moderator')).toBe(true);
      expect(hasMinimumRole('admin', 'viewer')).toBe(true);
      expect(hasMinimumRole('moderator', 'viewer')).toBe(true);
    });

    it('returns false when user role is lower than required', () => {
      expect(hasMinimumRole('viewer', 'moderator')).toBe(false);
      expect(hasMinimumRole('viewer', 'admin')).toBe(false);
      expect(hasMinimumRole('moderator', 'admin')).toBe(false);
      expect(hasMinimumRole('admin', 'owner')).toBe(false);
    });
  });

  describe('DASHBOARD_ROLE_ORDER', () => {
    it('orders viewer < moderator < admin < owner', () => {
      expect(DASHBOARD_ROLE_ORDER.viewer).toBe(0);
      expect(DASHBOARD_ROLE_ORDER.moderator).toBe(1);
      expect(DASHBOARD_ROLE_ORDER.admin).toBe(2);
      expect(DASHBOARD_ROLE_ORDER.owner).toBe(3);
    });
  });
});
