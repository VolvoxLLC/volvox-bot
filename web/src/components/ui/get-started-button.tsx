import { ChevronRight } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GetStartedButtonProps extends Omit<ButtonProps, 'children' | 'asChild'> {
  /** Button label text. */
  label?: string;
  /** When provided, renders as an anchor tag instead of a button. */
  href?: string;
}

/**
 * Animated swiper-style button with a sliding chevron reveal on hover.
 * Wraps the shadcn Button so all variant/size props are supported.
 */
export function GetStartedButton({
  label = 'Add to Discord — Free',
  href,
  className,
  ...props
}: GetStartedButtonProps) {
  const inner = (
    <>
      <span className="mr-8 transition-opacity duration-500 group-hover:opacity-0">{label}</span>
      <i className="absolute right-1.5 top-1.5 bottom-1.5 rounded-full z-10 grid w-10 place-items-center transition-all duration-500 bg-primary-foreground/15 group-hover:w-[calc(100%-0.75rem)] group-active:scale-95">
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </i>
    </>
  );

  if (href) {
    return (
      <Button
        className={cn('group relative overflow-hidden', className)}
        size="lg"
        asChild
        {...props}
      >
        <a href={href} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      </Button>
    );
  }

  return (
    <Button className={cn('group relative overflow-hidden', className)} size="lg" {...props}>
      {inner}
    </Button>
  );
}
