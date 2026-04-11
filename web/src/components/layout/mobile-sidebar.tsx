'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
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
        className="dashboard-chip h-10 w-14 min-w-10 p-0 rounded-full md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="flex h-full w-[min(21.5rem,90vw)] flex-col border-r border-border/70 bg-gradient-to-b from-card via-card/90 to-background p-0"
        >
          <SheetTitle className="sr-only">Dashboard Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Browse dashboard navigation and switch workspaces from the control room sidebar.
          </SheetDescription>
          <Sidebar onNavClick={() => setOpen(false)} className="flex-1" />
        </SheetContent>
      </Sheet>
    </>
  );
}
