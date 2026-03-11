'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { APP_TITLE, getDashboardDocumentTitle } from '@/lib/page-titles';

/**
 * Syncs `document.title` on client-side navigations.
 *
 * Guards against overwriting a more specific title that Next.js already set
 * from a page's `metadata` export: if the current title differs from what this
 * component last set, we assume something more specific (e.g. page-level
 * metadata) has updated it and leave it alone.
 */
export function DashboardTitleSync() {
  const pathname = usePathname();
  const lastSetRef = useRef<string>('');

  useEffect(() => {
    const computed = getDashboardDocumentTitle(pathname);
    const current = document.title;

    // If the current title differs from what we last set, something more specific
    // (e.g. page-level metadata) has changed it — don't overwrite.
    if (
      lastSetRef.current &&
      current !== lastSetRef.current &&
      current.endsWith(APP_TITLE) &&
      current !== APP_TITLE
    ) {
      return;
    }

    document.title = computed;
    lastSetRef.current = computed;
  }, [pathname]);

  return null;
}
