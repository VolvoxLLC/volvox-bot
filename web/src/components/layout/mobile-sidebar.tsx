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
        className="rounded-xl border border-border/60 bg-card md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-80 border-r border-border/70 bg-background p-0">
          <SheetHeader className="border-b border-border/60 p-4 pb-3 text-left">
            <SheetTitle className="text-base">Dashboard Menu</SheetTitle>
          </SheetHeader>
          <div className="p-4 pb-2">
            <ServerSelector />
          </div>
          <div className="px-4 pb-4">
            <Sidebar onNavClick={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
