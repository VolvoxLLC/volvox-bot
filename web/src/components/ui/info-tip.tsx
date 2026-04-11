'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface InfoTipProps {
  text: string;
}

export function InfoTip({ text }: InfoTipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[200px] border-border bg-muted p-2 text-[10px] leading-relaxed text-foreground">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
