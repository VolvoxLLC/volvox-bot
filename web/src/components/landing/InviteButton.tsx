'use client';

import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBotInviteUrl } from '@/lib/discord';

interface InviteButtonProps {
  size?: 'sm' | 'lg';
  className?: string;
}

/** Render an "Add to Server" button — disabled/hidden when CLIENT_ID is unset. */
export function InviteButton({ size = 'sm', className }: InviteButtonProps) {
  const url = getBotInviteUrl();
  if (!url) return null;
  return (
    <Button variant="discord" size={size} className={className} asChild>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {size === 'lg' && <Bot className="mr-2 h-5 w-5" />}
        Add to Server
      </a>
    </Button>
  );
}
