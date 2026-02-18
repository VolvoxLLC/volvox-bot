# RF-002a Batch 1: Middleware, Storage, Schemas, Config, Utils Audit

---

**Audited by:** openai-codex/gpt-5.2-codex  
**Reviewed by:** claude-opus-4-5 (Veritas)  
**Date:** 2026-02-02  
**Initiative:** RF-002 Cross-Model Code Audit  
**Scope:** 34 files, ~4,100 lines (middleware, storage, schemas, config, utils)

---

## Findings

### Finding 1: Localhost auth bypass trusts `X-Forwarded-For` (spoofable)

- **Severity:** High
- **File:** `server/src/middleware/auth.ts`
- **Line(s):** ~86–123
- **Category:** Security
- **Description:** `isLocalhostRequest()` trusts the `X-Forwarded-For` header unconditionally. If `VERITAS_AUTH_LOCALHOST_BYPASS=true`, a remote client can spoof `X-Forwarded-For: 127.0.0.1` to gain localhost bypass access. This is also used in WebSocket auth.
- **Impact:** Authentication bypass for any route when localhost bypass is enabled (common in dev setups; risky if accidentally enabled in prod or behind a proxy).
- **Recommendation:** Only trust `X-Forwarded-For` when `app.set('trust proxy', ...)` is configured or behind a known proxy. Otherwise use `req.socket.remoteAddress` only. Also consider disabling localhost bypass unless explicitly in dev mode.
- **Code snippet:**
  ```ts
  const forwarded = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  // ...
  remoteAddr = forwarded || req.socket.remoteAddress || '';
  ```

---

### Finding 2: API key generation uses `Math.random()` (not cryptographically secure)

- **Severity:** Medium
- **File:** `server/src/middleware/auth.ts`
- **Line(s):** ~357–369
- **Category:** Security
- **Description:** `generateApiKey()` uses `Math.random()` which is predictable and not suitable for secret generation.
- **Impact:** Generated keys may be guessable with enough observations, weakening API key security.
- **Recommendation:** Replace with `crypto.randomBytes()` and encode to base64/hex.
- **Code snippet:**
  ```ts
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  ```

---

### Finding 3: Rate limiting can be bypassed behind proxy appearing as localhost

- **Severity:** Medium
- **File:** `server/src/middleware/rate-limit.ts`
- **Line(s):** ~34–79
- **Category:** Best Practice / Security
- **Description:** `isLocalhost()` uses `req.ip` / `remoteAddress` to exempt localhost from some limits. If the app is behind a reverse proxy that terminates on 127.0.0.1 (or `trust proxy` isn't correctly set), all requests can be treated as localhost and skip rate limits.
- **Impact:** Rate limiting effectively disabled for all clients in some deployments.
- **Recommendation:** Require explicit `trust proxy` config and only exempt localhost if the resolved client IP is loopback; otherwise disable the exemption in non-dev environments.
- **Code snippet:**
  ```ts
  const ip = req.ip ?? req.socket?.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  ```

---

### Finding 4: BacklogRepository scans all files for single-task lookups

- **Severity:** Low
- **File:** `server/src/storage/backlog-repository.ts`
- **Line(s):** ~88–165
- **Category:** Performance
- **Description:** `findById()` calls `listAll()` which scans and parses every backlog file. `update()` and `delete()` both call `findById()`, causing repeated full directory scans.
- **Impact:** O(n) filesystem reads for point lookups; performance degrades with backlog size.
- **Recommendation:** Add an index (map of ID → file path) or store file name by ID; avoid full directory scans on single-task operations.
- **Code snippet:**
  ```ts
  async findById(id: string): Promise<Task | null> {
    const tasks = await this.listAll();
    return tasks.find((t) => t.id === id) || null;
  }
  ```

---

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 1     |
| Medium   | 2     |
| Low      | 1     |

| Category      | Count |
| ------------- | ----- |
| Security      | 2     |
| Performance   | 1     |
| Best Practice | 1     |

## Opus Review Notes

All 4 findings are **valid and actionable**:

- **Finding 1 (High):** Confirmed — `X-Forwarded-For` spoofing is a real risk. Should be fixed before any production deployment.
- **Finding 2 (Medium):** Confirmed — `Math.random()` for secrets is a textbook vulnerability. Easy fix with `crypto.randomBytes()`.
- **Finding 3 (Medium):** Confirmed — localhost rate-limit exemption + proxy config is a common footgun.
- **Finding 4 (Low):** Confirmed — acceptable at current scale (<100 backlog items) but should be indexed before scaling.

No false positives detected. Clean batch overall — 4 findings across 34 files is solid.
