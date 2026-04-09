'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
        className="dashboard-chip rounded-xl md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[min(21.5rem,92vw)] border-r border-border/70 bg-gradient-to-b from-card via-card/90 to-background p-0"
        >
          <SheetHeader className="border-b border-border/60 p-4 pb-3 text-left">
            <SheetTitle className="text-base font-semibold tracking-tight">Control Room</SheetTitle>
            <SheetDescription className="sr-only">
              Browse dashboard navigation and switch workspaces from the control room sidebar.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <Sidebar onNavClick={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
