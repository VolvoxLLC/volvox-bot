import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  usePreviewStatus,
  usePreviewOutput,
  useStartPreview,
  useStopPreview,
} from '@/hooks/usePreview';
import {
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  Loader2,
  Terminal,
  Monitor,
  AlertCircle,
} from 'lucide-react';
import type { Task } from '@veritas-kanban/shared';
import { cn } from '@/lib/utils';

interface PreviewPanelProps {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreviewPanel({ task, open, onOpenChange }: PreviewPanelProps) {
  const [showOutput, setShowOutput] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const { data: status, isLoading } = usePreviewStatus(open ? task.id : undefined);
  const { data: outputData } = usePreviewOutput(open && showOutput ? task.id : undefined);

  const startPreview = useStartPreview();
  const stopPreview = useStopPreview();

  const isRunning = status && 'url' in status && status.status === 'running';
  const isStarting = status && 'status' in status && status.status === 'starting';
  const hasError = status && 'error' in status && status.error;
  const previewUrl = status && 'url' in status ? status.url : null;

  const handleStart = () => {
    startPreview.mutate(task.id);
  };

  const handleStop = () => {
    stopPreview.mutate(task.id);
  };

  const handleRefresh = () => {
    setIframeKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[800px] sm:max-w-[800px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between pr-8">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Preview
              </SheetTitle>
              <SheetDescription>
                {task.git?.repo ? `Dev server for ${task.git.repo}` : 'No repository configured'}
              </SheetDescription>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {isRunning && (
                <>
                  <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleOpenExternal}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOutput(!showOutput)}
                    className={cn(showOutput && 'bg-muted')}
                  >
                    <Terminal className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleStop}
                    disabled={stopPreview.isPending}
                  >
                    {stopPreview.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </Button>
                </>
              )}

              {!isRunning && !isStarting && (
                <Button onClick={handleStart} disabled={startPreview.isPending || !task.git?.repo}>
                  {startPreview.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start Preview
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Loading state */}
          {(isLoading || isStarting) && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {isStarting ? 'Starting dev server...' : 'Loading...'}
                </p>
                {isStarting && status && 'output' in status && status.output.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    {status.output[status.output.length - 1]?.slice(0, 80)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {hasError && !isStarting && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
                <h3 className="font-semibold mb-2">Preview Error</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {status && 'error' in status ? status.error : 'An error occurred'}
                </p>
                <Button onClick={handleStart}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* Stopped state */}
          {!isRunning && !isStarting && !hasError && !isLoading && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">Preview Not Running</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {task.git?.repo
                    ? 'Start the dev server to see a live preview of your changes.'
                    : 'Configure a repository for this task to use preview.'}
                </p>
                {startPreview.error && (
                  <p className="text-sm text-red-500 mb-4">{startPreview.error.message}</p>
                )}
              </div>
            </div>
          )}

          {/* Running - show iframe */}
          {isRunning && previewUrl && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Output panel (collapsible) */}
              {showOutput && (
                <div className="h-48 border-b bg-black text-green-400 font-mono text-xs">
                  <ScrollArea className="h-full">
                    <div className="p-4">
                      {outputData?.output.map((line, i) => (
                        <div key={i} className="whitespace-pre-wrap break-all">
                          {line}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* URL bar */}
              <div className="px-4 py-2 border-b bg-muted/50 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">URL:</span>
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1">{previewUrl}</code>
              </div>

              {/* iframe */}
              <div className="flex-1 bg-white">
                <iframe
                  key={iframeKey}
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
