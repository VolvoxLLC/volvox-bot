'use client';

import { useEffect, useState } from 'react';

export type GlobalAdminStatus = 'loading' | 'allowed' | 'denied';

export interface UseGlobalAdminStatusResult {
  /** True only after /api/global-admin explicitly authorizes the current user. */
  isGlobalAdmin: boolean;
  /** Auth check lifecycle; denied is also used for request/parse failures. */
  status: GlobalAdminStatus;
  /** True while the global-admin check is pending. */
  isLoading: boolean;
}

/**
 * Shared client-side global-admin authorization check.
 *
 * Fails closed for non-OK responses, malformed responses, and network errors, and avoids state
 * updates after unmount so consumers can safely use it from long-lived layout components.
 */
export function useGlobalAdminStatus(): UseGlobalAdminStatusResult {
  const [status, setStatus] = useState<GlobalAdminStatus>('loading');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch('/api/global-admin', { cache: 'no-store' });
        if (!response.ok) {
          if (mounted) setStatus('denied');
          return;
        }

        const data = (await response.json()) as { isGlobalAdmin?: boolean };
        if (mounted) setStatus(data.isGlobalAdmin === true ? 'allowed' : 'denied');
      } catch {
        if (mounted) setStatus('denied');
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    isGlobalAdmin: status === 'allowed',
    isLoading: status === 'loading',
    status,
  };
}
