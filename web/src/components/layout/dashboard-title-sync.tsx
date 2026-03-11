'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { APP_TITLE, getDashboardDocumentTitle } from '@/lib/page-titles';

/**
 * Syncs `document.title` on client-side navigations.
 *
 * Guards against overwriting a more specific title that Next.js already set
 * from a page's `metadata` export: if the current title already ends with
 * APP_TITLE but has a *different* page-section prefix than what this component
 * would produce, we assume the page set a more specific title and leave it alone.
 */
export function DashboardTitleSync() {
  const pathname = usePathname();
  const lastSyncedTitleRef = useRef<string | null>(null);

  useEffect(() => {
    const computed = getDashboardDocumentTitle(pathname);
    const current = document.title;
    const lastSyncedTitle = lastSyncedTitleRef.current;

    // If the current title already ends with our app suffix and is more specific
    // than what we'd set (i.e. different prefix), respect the page-level metadata.
    if (
      current.endsWith(APP_TITLE) &&
      current !== computed &&
      current !== APP_TITLE &&
      current !== lastSyncedTitle
    ) {
      return;
    }

    document.title = computed;
    lastSyncedTitleRef.current = computed;
  }, [pathname]);

  return null;
}
