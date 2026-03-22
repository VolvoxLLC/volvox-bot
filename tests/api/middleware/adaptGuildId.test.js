import { describe, expect, it, vi } from 'vitest';
import {
  adaptDeleteGuildIdParam,
  adaptGuildIdFromBody,
  adaptGuildIdFromQuery,
} from '../../../src/api/middleware/adaptGuildId.js';

function makeReq(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

describe('adaptGuildId middleware', () => {
  describe('adaptGuildIdFromQuery', () => {
    it('copies query.guildId to params.id', () => {
      const req = makeReq({ query: { guildId: 'guild-123' } });
      const next = vi.fn();

      adaptGuildIdFromQuery(req, {}, next);

      expect(req.params.id).toBe('guild-123');
      expect(next).toHaveBeenCalledOnce();
    });

    it('leaves params.id unchanged when query.guildId is absent', () => {
      const req = makeReq({ params: { id: 'existing-id' } });
      const next = vi.fn();

      adaptGuildIdFromQuery(req, {}, next);

      expect(req.params.id).toBe('existing-id');
      expect(next).toHaveBeenCalledOnce();
    });

    it('always calls next()', () => {
      const req = makeReq();
      const next = vi.fn();

      adaptGuildIdFromQuery(req, {}, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('adaptGuildIdFromBody', () => {
    it('copies body.guildId to params.id', () => {
      const req = makeReq({ body: { guildId: 'guild-456' } });
      const next = vi.fn();

      adaptGuildIdFromBody(req, {}, next);

      expect(req.params.id).toBe('guild-456');
      expect(next).toHaveBeenCalledOnce();
    });

    it('leaves params.id unchanged when body.guildId is absent', () => {
      const req = makeReq({ params: { id: 'existing-id' }, body: {} });
      const next = vi.fn();

      adaptGuildIdFromBody(req, {}, next);

      expect(req.params.id).toBe('existing-id');
      expect(next).toHaveBeenCalledOnce();
    });

    it('handles missing body gracefully', () => {
      const req = makeReq({ body: undefined });
      const next = vi.fn();

      adaptGuildIdFromBody(req, {}, next);

      expect(req.params.id).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    });

    it('always calls next()', () => {
      const req = makeReq();
      const next = vi.fn();

      adaptGuildIdFromBody(req, {}, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('adaptDeleteGuildIdParam', () => {
    it('saves params.id as params.tempRoleId and sets params.id to query.guildId', () => {
      const req = makeReq({ params: { id: 'role-789' }, query: { guildId: 'guild-123' } });
      const next = vi.fn();

      adaptDeleteGuildIdParam(req, {}, next);

      expect(req.params.tempRoleId).toBe('role-789');
      expect(req.params.id).toBe('guild-123');
      expect(next).toHaveBeenCalledOnce();
    });

    it('leaves params unchanged when query.guildId is absent', () => {
      const req = makeReq({ params: { id: 'role-789' }, query: {} });
      const next = vi.fn();

      adaptDeleteGuildIdParam(req, {}, next);

      expect(req.params.tempRoleId).toBeUndefined();
      expect(req.params.id).toBe('role-789');
      expect(next).toHaveBeenCalledOnce();
    });

    it('always calls next()', () => {
      const req = makeReq();
      const next = vi.fn();

      adaptDeleteGuildIdParam(req, {}, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });
});
