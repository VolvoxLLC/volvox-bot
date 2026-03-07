'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { getDashboardDocumentTitle } from '@/lib/page-titles';

export function DashboardTitleSync() {
  const pathname = usePathname();

  useEffect(() => {
    document.title = getDashboardDocumentTitle(pathname);
  }, [pathname]);

  return null;
}
