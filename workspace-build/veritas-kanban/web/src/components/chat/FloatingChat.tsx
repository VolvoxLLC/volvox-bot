import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { chatEventTarget } from '@/hooks/useTaskSync';
import { cn } from '@/lib/utils';

/**
 * Floating chat bubble — bottom-right corner.
 * Opens a board-level ChatPanel (no taskId).
 * Pulses when a new response arrives while closed.
 */
export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  // Listen for incoming chat messages when panel is closed
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      // Only pulse for board-level chat messages (no taskId in sessionId)
      if (
        !open &&
        (msg.type === 'chat:message' || msg.type === 'chat:delta') &&
        msg.sessionId &&
        !msg.sessionId.includes('task_')
      ) {
        setHasUnread(true);
      }
    };

    chatEventTarget.addEventListener('chat', handler);
    return () => chatEventTarget.removeEventListener('chat', handler);
  }, [open]);

  // Clear unread when opening
  const handleOpen = () => {
    setOpen(true);
    setHasUnread(false);
  };

  return (
    <>
      {/* Floating button */}
      <Button
        onClick={handleOpen}
        size="icon"
        className={cn(
          'fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg',
          'bg-primary hover:bg-primary/90 text-primary-foreground',
          'transition-all duration-200 hover:scale-105',
          open && 'hidden'
        )}
        aria-label="Open chat"
      >
        <MessageSquare className="h-6 w-6" />
        {hasUnread && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
          </span>
        )}
      </Button>

      {/* Chat panel — board-level (no taskId) */}
      <ChatPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
