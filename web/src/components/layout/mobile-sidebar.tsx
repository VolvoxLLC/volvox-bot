'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ServerSelector } from './server-selector';
import { Sidebar } from './sidebar';

/**
 * Client component that manages the mobile sidebar sheet toggle.
 * Extracted so the parent DashboardShell can be a server component.
 */
export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="p-4 pb-0">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="p-4">
            <ServerSelector />
          </div>
          <Sidebar onNavClick={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
