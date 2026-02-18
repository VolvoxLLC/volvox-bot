import { useState, useEffect } from 'react';
import { Lock, LogOut, Shield, Clock, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';

interface UserMenuProps {
  onOpenSecuritySettings?: () => void;
}

export function UserMenu({ onOpenSecuritySettings }: UserMenuProps) {
  const { status, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Format session expiry
  const formatExpiry = (expiry: string | null) => {
    if (!expiry) return 'No expiry';
    
    const expiryDate = new Date(expiry);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Expired';
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h remaining`;
    }
    if (diffHours > 0) {
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${diffHours}h ${diffMins}m remaining`;
    }
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}m remaining`;
  };

  // Keyboard shortcut: Cmd/Ctrl+Shift+L for logout
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleLogout();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
    setOpen(false);
    // Page will redirect via AuthGuard
  };

  const handleSecurityClick = () => {
    setOpen(false);
    onOpenSecuritySettings?.();
  };

  // Don't render if not authenticated
  if (!status?.authenticated) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          title="Session menu"
        >
          <Lock className="h-4 w-4 text-emerald-500" />
          <span className="text-xs text-muted-foreground hidden sm:inline">Secured</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-emerald-500" />
            Logged In
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatExpiry(status.sessionExpiry)}
          </div>
        </div>
        
        <div className="p-1">
          <button
            onClick={handleSecurityClick}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
          >
            <Shield className="h-4 w-4" />
            Security Settings
          </button>
          
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-destructive/10 text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? 'Logging out...' : 'Log Out'}
            <span className="ml-auto text-xs text-muted-foreground">⌘⇧L</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
